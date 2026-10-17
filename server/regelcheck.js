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
        const jaNein = aus.get(element.id).filter((fl) => /^(ja|nein|yes|no)$/i.test((fl.name || "").trim()));
        if (unbeschriftet.length > 0) {
          h("§10", element, `Die ausgehenden Pfade am Gateway ${label(element)} sollten mit dem Ergebnis beschriftet sein (z. B. "vollständig" und "unvollständig").`);
        } else if (jaNein.length > 0) {
          h("§10", element, `Die Pfade am Gateway ${label(element)} sind mit "ja/nein" beschriftet. Besser das Ergebnis nennen, z. B. "überschritten" und "nicht überschritten".`);
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

  // Tokenfluss nur prüfen, wenn die Grundstruktur stimmt; sonst sind die Meldungen dort aussagekräftiger
  if (fehler.length === 0) {
    for (const befund of pruefeTokenfluss(modell, ein, aus, byId)) f("§11", byId.get(befund.element), befund.text);
  }

  return { fehler, hinweise };
}

// Regelwerk §11: Tokenfluss durchspielen.
// Ein paralleles Gateway erzeugt je Ausgang einen Token, eine parallele Zusammenführung wartet auf einen Token
// je Eingang. Exklusive und ereignisbasierte Gateways geben einen Token an genau einen Ausgang weiter,
// alle anderen Elemente reichen ihn weiter. Gesucht werden zwei Strukturfehler:
// - Verklemmung: Ein Token wartet an einer parallelen Zusammenführung, an der nie alle Eingänge ankommen.
// - Mehrfachausführung: Parallele Pfade laufen über ein exklusives Gateway zusammen, danach laufen zwei Token.
const MAX_ZUSTAENDE = 20000;

export function pruefeTokenfluss(modell, ein, aus, byId) {
  const befunde = [];
  const label = (id) => {
    const element = byId.get(id);
    return element?.name ? `"${element.name}"` : id;
  };
  const vorJoin = (id) => {
    const weiter = aus.get(id)[0];
    return weiter ? ` vor ${label(weiter.nach)}` : "";
  };
  const wahlText = (fluss) => (fluss.name ? `"${fluss.name}"` : `weiter zu ${label(fluss.nach)}`);

  const verklemmt = new Map();
  const doppelt = new Map();

  for (const start of modell.elemente.filter((e) => e.typ === "start")) {
    const anfang = new Map();
    for (const fluss of aus.get(start.id)) anfang.set(fluss.id, 1);
    const schluessel = (m) => [...m].filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => `${k}:${n}`).join(",");
    const gesehen = new Map([[schluessel(anfang), null]]);
    const warteschlange = [{ markierung: anfang, key: schluessel(anfang) }];

    const weg = (key) => {
      const wahlen = [];
      for (let k = key; gesehen.get(k); k = gesehen.get(k).von) {
        if (gesehen.get(k).wahl) wahlen.unshift(gesehen.get(k).wahl);
      }
      return wahlen;
    };

    while (warteschlange.length && gesehen.size < MAX_ZUSTAENDE) {
      const { markierung, key } = warteschlange.shift();
      const nachfolger = [];
      const knoten = new Set();
      for (const [flussId, n] of markierung) {
        if (n > 0) knoten.add(modell.fluesse.find((fl) => fl.id === flussId).nach);
      }

      for (const id of knoten) {
        const element = byId.get(id);
        const eingehend = ein.get(id);
        const ausgehend = aus.get(id);
        if (element.typ === "und") {
          if (!eingehend.every((fl) => (markierung.get(fl.id) || 0) > 0)) continue;
          const m = new Map(markierung);
          for (const fl of eingehend) m.set(fl.id, m.get(fl.id) - 1);
          for (const fl of ausgehend) m.set(fl.id, (m.get(fl.id) || 0) + 1);
          nachfolger.push({ m, wahl: null });
          continue;
        }
        for (const fl of eingehend) {
          if (!((markierung.get(fl.id) || 0) > 0)) continue;
          const basis = new Map(markierung);
          basis.set(fl.id, basis.get(fl.id) - 1);
          if (element.typ === "xor" || element.typ === "ereignisgateway") {
            for (const raus of ausgehend) {
              const m = new Map(basis);
              m.set(raus.id, (m.get(raus.id) || 0) + 1);
              nachfolger.push({ m, wahl: ausgehend.length > 1 ? wahlText(raus) : null });
            }
          } else {
            for (const raus of ausgehend) basis.set(raus.id, (basis.get(raus.id) || 0) + 1);
            nachfolger.push({ m: basis, wahl: null });
          }
        }
      }

      if (nachfolger.length === 0) {
        // Kein Element kann weiterarbeiten. Bleiben Token übrig, warten sie an einer parallelen Zusammenführung.
        for (const [flussId, n] of markierung) {
          if (n <= 0) continue;
          const joinId = modell.fluesse.find((fl) => fl.id === flussId).nach;
          if (!verklemmt.has(joinId)) verklemmt.set(joinId, []);
          const liste = verklemmt.get(joinId);
          const fehlend = ein.get(joinId).filter((fl) => !((markierung.get(fl.id) || 0) > 0));
          const beispiel = { wahlen: weg(key), fehlend };
          if (liste.length < 3 && !liste.some((b) => b.wahlen.join() === beispiel.wahlen.join())) liste.push(beispiel);
        }
        continue;
      }

      for (const { m, wahl } of nachfolger) {
        const k = schluessel(m);
        if (gesehen.has(k)) continue;
        gesehen.set(k, { von: key, wahl });
        const mehrfach = [...m].find(([, n]) => n > 1);
        if (mehrfach) {
          const ziel = modell.fluesse.find((fl) => fl.id === mehrfach[0]).nach;
          if (!doppelt.has(ziel)) doppelt.set(ziel, weg(k));
          continue;
        }
        warteschlange.push({ markierung: m, key: k });
      }
    }
  }

  for (const [joinId, beispiele] of verklemmt) {
    const fehlend = [...new Set(beispiele.flatMap((b) => b.fehlend.map((fl) => (fl.name ? `"${fl.name}"` : `von ${label(fl.von)}`))))].join(", ");
    const enden = vorzeitigeEnden(joinId, modell, ein, aus, byId).map(label);
    const grund = enden.length
      ? `Er kann vorher enden: in ${enden.join(", ")}`
      : `z. B. bei ${beispiele[0].wahlen.join(", dann ")}`;
    befunde.push({
      element: joinId,
      text: `Die parallele Zusammenführung${vorJoin(joinId)} wartet auf alle Pfade, aber der Pfad ${fehlend} kommt nicht in jedem Fall an. ${grund}. Der Ablauf bliebe an der Zusammenführung für immer stehen. Jeder Pfad nach einer parallelen Verzweigung muss die Zusammenführung erreichen; eine Entscheidung, die den Vorgang beendet, gehört vor die Verzweigung oder hinter die Zusammenführung.`
    });
  }
  for (const [zielId, wahlen] of doppelt) {
    const fall = wahlen.length ? ` (z. B. bei ${wahlen.join(", dann ")})` : "";
    befunde.push({
      element: zielId,
      text: `${label(zielId)} würde mehrfach ausgeführt${fall}: Parallele Pfade laufen über ein exklusives Gateway zusammen. Parallele Pfade werden mit einem parallelen Gateway zusammengeführt.`
    });
  }
  return befunde;
}

// Endereignisse, die nach einer parallelen Verzweigung erreicht werden, ohne über die Zusammenführung zu laufen
function vorzeitigeEnden(joinId, modell, ein, aus, byId) {
  const vorJoin = new Set([joinId]);
  const stapel = [joinId];
  while (stapel.length) {
    const id = stapel.pop();
    for (const fl of ein.get(id)) {
      if (!vorJoin.has(fl.von)) {
        vorJoin.add(fl.von);
        stapel.push(fl.von);
      }
    }
  }
  const verzweigungen = modell.elemente.filter((e) => e.typ === "und" && aus.get(e.id).length > 1 && vorJoin.has(e.id));
  const enden = new Set();
  for (const split of verzweigungen) {
    const gesehen = new Set([split.id, joinId]);
    const offen = aus.get(split.id).map((fl) => fl.nach);
    while (offen.length) {
      const id = offen.pop();
      if (gesehen.has(id)) continue;
      gesehen.add(id);
      if (byId.get(id).typ === "ende") enden.add(id);
      for (const fl of aus.get(id)) offen.push(fl.nach);
    }
  }
  return [...enden];
}
