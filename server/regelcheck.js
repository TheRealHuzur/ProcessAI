// Deterministischer Regelcheck auf dem JSON-Prozessmodell.
// Grundlage: docs/bpmn-regelwerk.md. Die Paragrafen verweisen auf die Abschnitte dort.
//
// fehler:   Verstoß gegen eine Strukturregel. Die KI bekommt eine Korrekturrunde.
// hinweise: Stil- und Benennungsregeln. Werden dem Menschen angezeigt.

const GATEWAYS = new Set(["xor", "und", "ereignisgateway"]);
const AKTIVITAETEN = new Set(["aufgabe", "teilprozess"]);
const HILFSVERBEN = /\b(ist|sind|hat|haben|wurde|wurden|liegt|liegen|geht|gehen|kommt|kommen|trifft|treffen|erreicht|vorhanden|eingegangen|abgelaufen|verstrichen|erfolgt|beendet|abgeschlossen|erledigt|vor|nach)\b/i;
const PAUSCHALE_ENDEN = /^(prozess|vorgang|ablauf)\s+(ist\s+)?(beendet|abgeschlossen|fertig|ende)$|^ende$|^fertig$/i;
const SUBSTANTIVIERUNG = /^[A-ZÄÖÜ][a-zäöüß]*(ung|heit|keit|ion|nahme|gabe|tion)$/;

function zaehle(modell) {
  const ein = new Map();
  const aus = new Map();
  for (const element of modell.elemente) {
    ein.set(element.id, []);
    aus.set(element.id, []);
  }
  for (const fluss of modell.fluesse) {
    aus.get(fluss.von)?.push(fluss);
    ein.get(fluss.nach)?.push(fluss);
  }
  return { ein, aus };
}

function erreichbar(startIds, nachbarn) {
  const gesehen = new Set(startIds);
  const stapel = [...startIds];
  while (stapel.length) {
    const id = stapel.pop();
    for (const next of nachbarn(id)) {
      if (!gesehen.has(next)) {
        gesehen.add(next);
        stapel.push(next);
      }
    }
  }
  return gesehen;
}

export function pruefeModell(modell) {
  const fehler = [];
  const hinweise = [];
  const { ein, aus } = zaehle(modell);
  const byId = new Map(modell.elemente.map((e) => [e.id, e]));
  const label = (element) => (element.name ? `"${element.name}"` : element.id);
  const f = (regel, element, textValue) => fehler.push({ regel, element: element?.id || "", text: textValue });
  const h = (regel, element, textValue) => hinweise.push({ regel, element: element?.id || "", text: textValue });

  const starts = modell.elemente.filter((e) => e.typ === "start");
  const enden = modell.elemente.filter((e) => e.typ === "ende");

  if (modell.elemente.length === 0) {
    f("§3", null, "Das Modell enthält keine Elemente.");
    return { fehler, hinweise };
  }
  if (starts.length === 0) f("§3", null, "Es fehlt ein Startereignis.");
  if (enden.length === 0) f("§3", null, "Es fehlt ein Endereignis.");

  for (const element of modell.elemente) {
    const nIn = ein.get(element.id).length;
    const nOut = aus.get(element.id).length;

    switch (element.typ) {
      case "start":
        if (nIn > 0) f("§5", element, `Startereignis ${label(element)} darf keinen eingehenden Sequenzfluss haben.`);
        if (nOut !== 1) f("§5", element, `Startereignis ${label(element)} braucht genau einen ausgehenden Sequenzfluss (hat ${nOut}).`);
        break;
      case "zwischen":
        if (nIn !== 1 || nOut !== 1) f("§6", element, `Zwischenereignis ${label(element)} braucht genau einen ein- und einen ausgehenden Sequenzfluss (hat ${nIn} ein, ${nOut} aus).`);
        break;
      case "ende":
        if (nIn !== 1) f("§7", element, `Endereignis ${label(element)} braucht genau einen eingehenden Sequenzfluss (hat ${nIn}). Mehrere Pfade vorher über ein Gateway zusammenführen oder eigene Endereignisse verwenden.`);
        if (nOut > 0) f("§7", element, `Endereignis ${label(element)} darf keinen ausgehenden Sequenzfluss haben.`);
        break;
      case "aufgabe":
      case "teilprozess":
        if (nIn !== 1) f("§8", element, `${element.typ === "aufgabe" ? "Aufgabe" : "Teilprozess"} ${label(element)} braucht genau einen eingehenden Sequenzfluss (hat ${nIn}). Mehrere Pfade vorher über ein Gateway zusammenführen.`);
        if (nOut !== 1) f("§8", element, `${element.typ === "aufgabe" ? "Aufgabe" : "Teilprozess"} ${label(element)} braucht genau einen ausgehenden Sequenzfluss (hat ${nOut}). Verzweigungen über ein Gateway modellieren.`);
        break;
      default:
        break;
    }

    if (GATEWAYS.has(element.typ)) {
      const istSplit = nIn === 1 && nOut >= 2;
      const istJoin = nIn >= 2 && nOut === 1;
      if (!istSplit && !istJoin) {
        f("§9", element, `Gateway ${label(element)} muss entweder verzweigen (1 ein, mehrere aus) oder zusammenführen (mehrere ein, 1 aus). Hat ${nIn} ein, ${nOut} aus.`);
      }
      if (element.typ === "ereignisgateway") {
        if (!istSplit) f("§12", element, `Ereignisbasiertes Gateway ${label(element)} darf nur verzweigen. Zusammengeführt wird mit einem XOR-Gateway.`);
        for (const fluss of aus.get(element.id)) {
          const ziel = byId.get(fluss.nach);
          if (ziel && ziel.typ !== "zwischen") {
            f("§12", element, `Nach dem ereignisbasierten Gateway ${label(element)} muss direkt ein Zwischenereignis folgen, nicht ${label(ziel)}.`);
          }
        }
      }
      if (element.typ === "xor" && istSplit) {
        const unbeschriftet = aus.get(element.id).filter((fl) => !fl.name);
        if (unbeschriftet.length > 0) {
          h("§10", element, `Die ausgehenden Pfade am Gateway ${label(element)} sollten mit dem Ergebnis beschriftet sein (z. B. "vollständig" und "unvollständig").`);
        }
      }
    }

    // Benennung
    if (AKTIVITAETEN.has(element.typ)) {
      if (!element.name) {
        f("§8", element, `Eine Aufgabe (${element.id}) hat keinen Namen.`);
      } else {
        const woerter = element.name.split(/\s+/).filter(Boolean);
        if (woerter.length === 1 && SUBSTANTIVIERUNG.test(woerter[0])) {
          h("§8", element, `${label(element)} klingt nach einer Substantivierung. Besser nach Schema Objekt und Verb, z. B. "Antrag prüfen".`);
        } else if (woerter.length < 2) {
          h("§8", element, `${label(element)}: Aufgaben werden nach dem Schema Objekt und Verb benannt.`);
        }
        if (/\b(und|sowie)\b/i.test(element.name)) {
          h("§8", element, `${label(element)} enthält vielleicht mehrere Tätigkeiten. Dann wären es mehrere Aufgaben.`);
        }
      }
    }

    if (["start", "zwischen", "ende"].includes(element.typ)) {
      if (!element.name) {
        h("§4", element, `Ein Ereignis (${element.id}) hat keine Beschriftung.`);
      } else if (!HILFSVERBEN.test(element.name) && /en$/i.test(element.name.split(/\s+/).pop())) {
        h("§4", element, `${label(element)} klingt nach einer Tätigkeit. Ereignisse beschreiben einen Zustand, z. B. "Antrag ist eingegangen".`);
      }
    }

    if (element.typ === "ende" && element.name && PAUSCHALE_ENDEN.test(element.name.trim())) {
      h("§7", element, `${label(element)} ist ein pauschales Ende. Besser den fachlichen Endzustand nennen.`);
    }
  }

  // Gleich benannte Endereignisse
  const endNamen = new Map();
  for (const ende of enden) {
    const k = (ende.name || "").toLowerCase();
    if (!k) continue;
    endNamen.set(k, (endNamen.get(k) || 0) + 1);
  }
  for (const [name, anzahl] of endNamen) {
    if (anzahl > 1) h("§7", null, `${anzahl} Endereignisse heißen "${name}". Unterschiedliche Ergebnisse brauchen unterschiedliche Namen, gleiche Ergebnisse können zusammengeführt werden.`);
  }

  // Kein Pfad ins Leere
  if (starts.length > 0 && enden.length > 0) {
    const vorwaerts = erreichbar(starts.map((s) => s.id), (id) => aus.get(id).map((fl) => fl.nach));
    const rueckwaerts = erreichbar(enden.map((e) => e.id), (id) => ein.get(id).map((fl) => fl.von));
    for (const element of modell.elemente) {
      if (!vorwaerts.has(element.id)) {
        f("§3", element, `${label(element)} ist von keinem Startereignis aus erreichbar.`);
      } else if (!rueckwaerts.has(element.id)) {
        f("§3", element, `Von ${label(element)} aus führt kein Weg zu einem Endereignis.`);
      }
    }
  }

  return { fehler, hinweise };
}
