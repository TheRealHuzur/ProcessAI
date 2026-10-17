// Ablauf "Modell erzeugen":
// Text -> KI (JSON) -> Bereinigung -> Regelcheck -> ggf. eine Korrekturrunde -> Anordnung -> BPMN-XML
// "Modell ändern": bestehendes Modell + Anweisung -> derselbe Weg, dazu Vergleich alt/neu
import { chatCompletion, extractJson, LlmError } from "./llm.js";
import { systemPrompt, nutzerNachricht, korrekturNachricht, aenderungsPrompt, aenderungsNachricht } from "./prompt.js";
import { normalisiereModell } from "./modell.js";
import { pruefeModell } from "./regelcheck.js";
import { anordnen, datenDarstellungen } from "./layout.js";
import { erzeugeBpmnXml } from "./bpmn-xml.js";

const MAX_KORREKTUREN = 1;

const MERGE_ZIELE = new Set(["aufgabe", "teilprozess", "zwischen", "ende"]);

// Regelwerk §8/§9: Mehrere Pfade dürfen nicht direkt in eine Aufgabe oder ein Ereignis laufen.
// Das ist eine rein formale Korrektur ohne neuen Inhalt, deshalb macht die App sie selbst:
// Davor wird ein exklusives Gateway (XOR) als Zusammenführung eingefügt.
export function ergaenzeZusammenfuehrungen(modell) {
  const hinweise = [];
  const vergeben = new Set([...modell.elemente.map((e) => e.id), ...modell.fluesse.map((f) => f.id)]);
  const neueId = (basis) => {
    let id = basis;
    let n = 2;
    while (vergeben.has(id)) {
      id = `${basis}_${n}`;
      n += 1;
    }
    vergeben.add(id);
    return id;
  };

  for (const ziel of [...modell.elemente]) {
    if (!MERGE_ZIELE.has(ziel.typ)) continue;
    const eingehend = modell.fluesse.filter((f) => f.nach === ziel.id);
    if (eingehend.length < 2) continue;
    const gatewayId = neueId(`Gateway_Join_${ziel.id}`.slice(0, 60));
    const index = modell.elemente.indexOf(ziel);
    modell.elemente.splice(index, 0, { id: gatewayId, typ: "xor", art: "", name: "", rolle: ziel.rolle, beschreibung: "" });
    for (const fluss of eingehend) fluss.nach = gatewayId;
    modell.fluesse.push({ id: neueId(`Flow_${gatewayId}`.slice(0, 60)), von: gatewayId, nach: ziel.id, name: "" });
    hinweise.push({ regel: "§9", element: gatewayId, text: `Vor "${ziel.name || ziel.id}" liefen mehrere Pfade direkt zusammen. Die App hat dort ein exklusives Gateway als Zusammenführung ergänzt. Bitte prüfen, ob eine parallele Zusammenführung gemeint war.` });
  }
  return hinweise;
}

// Regelwerk §7: Ein Endereignis liegt in der Schwimmbahn des Schritts davor.
// Rein formale Korrektur ohne neuen Inhalt, deshalb macht die App sie selbst.
export function endereignisseInBahn(modell) {
  const hinweise = [];
  if (modell.rollen.length < 2) return hinweise;
  const byId = new Map(modell.elemente.map((e) => [e.id, e]));
  const rollenName = new Map(modell.rollen.map((r) => [r.id, r.name]));
  for (const ende of modell.elemente.filter((e) => e.typ === "ende")) {
    const eingehend = modell.fluesse.filter((f) => f.nach === ende.id);
    if (eingehend.length !== 1) continue;
    const vorher = byId.get(eingehend[0].von);
    if (!vorher || vorher.rolle === ende.rolle) continue;
    hinweise.push({ regel: "§7", element: ende.id, text: `"${ende.name || ende.id}" lag in der Bahn "${rollenName.get(ende.rolle) || ende.rolle}". Die App hat das Endereignis in die Bahn des Schritts davor verschoben ("${rollenName.get(vorher.rolle) || vorher.rolle}").` });
    ende.rolle = vorher.rolle;
  }
  return hinweise;
}

// Modell aus JSON bauen, ohne KI. Wird auch von Tests verwendet.
export function bauenAusJson(roh) {
  const { modell, probleme } = normalisiereModell(roh);
  const automatisch = [...ergaenzeZusammenfuehrungen(modell), ...endereignisseInBahn(modell)];
  const pruefung = pruefeModell(modell);
  pruefung.hinweise = [...automatisch, ...pruefung.hinweise];
  return { modell, probleme, pruefung };
}

export function zuXml(modell) {
  const layout = anordnen(modell);
  return erzeugeBpmnXml(modell, layout);
}

// KI-Antwort holen, Regelcheck, bei Fehlern eine Korrekturrunde. Gibt das bessere Ergebnis zurück.
async function kiMitRegelcheck({ messages, model, llm }) {
  const protokoll = [];
  let ergebnis = null;
  let korrigiert = false;

  for (let runde = 0; runde <= MAX_KORREKTUREN; runde += 1) {
    const antwort = await llm({ model, messages });
    messages.push({ role: "assistant", content: antwort.content });

    let roh;
    try {
      roh = extractJson(antwort.content);
    } catch (error) {
      protokoll.push({ runde, fehler: "Antwort war kein lesbares JSON" });
      if (runde < MAX_KORREKTUREN) {
        messages.push({ role: "user", content: "Deine Antwort war kein gültiges JSON. Antworte ausschließlich mit dem vollständigen JSON-Objekt im verlangten Format." });
        continue;
      }
      throw error;
    }

    const aktuell = bauenAusJson(roh);
    const alleFehler = [...aktuell.probleme, ...aktuell.pruefung.fehler];
    protokoll.push({ runde, fehler: alleFehler.length, hinweise: aktuell.pruefung.hinweise.length });

    // Das bessere Ergebnis behalten, falls die Korrektur schlechter wird
    if (!ergebnis || alleFehler.length <= ergebnis.anzahlFehler) {
      ergebnis = { ...aktuell, roh, anzahlFehler: alleFehler.length, alleFehler };
      korrigiert = runde > 0;
    }

    if (alleFehler.length === 0 || runde === MAX_KORREKTUREN) break;
    messages.push({ role: "user", content: korrekturNachricht(alleFehler) });
  }

  if (!ergebnis || ergebnis.modell.elemente.length === 0) {
    throw new LlmError("Die KI hat kein verwertbares Modell geliefert.");
  }
  return { ...ergebnis, korrigiert, protokoll };
}

function antwortAusErgebnis(ergebnis) {
  return {
    xml: zuXml(ergebnis.modell),
    prozessname: ergebnis.modell.prozessname,
    modellJson: ergebnis.roh,
    pruefung: { fehler: ergebnis.alleFehler, hinweise: ergebnis.pruefung.hinweise },
    unklarheiten: ergebnis.modell.unklarheiten,
    nichtModelliert: ergebnis.modell.nichtModelliert,
    korrigiert: ergebnis.korrigiert,
    protokoll: ergebnis.protokoll
  };
}

// llm ist austauschbar (für Tests): async ({ model, messages }) => { content }
export async function erzeugeModell({ text, prozessname, model, llm = chatCompletion }) {
  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: nutzerNachricht({ prozessname, text }) }
  ];
  return antwortAusErgebnis(await kiMitRegelcheck({ messages, model, llm }));
}

// Die Beschreibungen (Arbeitshilfen) gehen nicht an die KI. Sie werden über die id übernommen,
// bei geänderter id über Name und Typ, wenn das eindeutig ist.
export function uebernehmeBeschreibungen(alt, neu) {
  const altById = new Map(alt.elemente.map((e) => [e.id, e]));
  for (const element of neu.elemente) {
    let quelle = altById.get(element.id);
    if (!quelle && element.name) {
      const kandidaten = alt.elemente.filter((e) => e.name === element.name && e.typ === element.typ);
      if (kandidaten.length === 1) quelle = kandidaten[0];
    }
    if (quelle && quelle.beschreibung) element.beschreibung = quelle.beschreibung;
  }
}

// Was hat sich zwischen zwei Modellen geändert? ids für die Markierung im Editor.
export function vergleicheModelle(alt, neu) {
  const ergebnis = { neu: [], geaendert: [], entfernt: [] };
  const wert = (x, f) => JSON.stringify(Array.isArray(x[f]) ? [...x[f]].sort() : x[f]);
  const vergleiche = (liste, felder, art, idsFuer = (x) => [x.id]) => {
    const altById = new Map(alt[liste].map((x) => [x.id, x]));
    const neuIds = new Set(neu[liste].map((x) => x.id));
    for (const x of neu[liste]) {
      const vorher = altById.get(x.id);
      if (!vorher) ergebnis.neu.push(...idsFuer(x));
      else if (felder.some((f) => wert(vorher, f) !== wert(x, f))) ergebnis.geaendert.push(...idsFuer(x));
    }
    for (const x of alt[liste]) {
      if (!neuIds.has(x.id)) ergebnis.entfernt.push({ id: x.id, name: x.name || "", art });
    }
  };
  // Ein Datenobjekt kann mehrere Darstellungen haben (eine je Aufgabe); markiert werden alle
  const datenRefs = new Map();
  for (const ref of datenDarstellungen(neu)) datenRefs.set(ref.daten.id, [...(datenRefs.get(ref.daten.id) || []), ref.id]);

  vergleiche("rollen", ["name"], "Schwimmbahn");
  vergleiche("externe", ["name"], "Beteiligte");
  vergleiche("elemente", ["typ", "art", "name", "rolle"], "Element");
  vergleiche("fluesse", ["von", "nach", "name"], "Sequenzfluss");
  vergleiche("nachrichten", ["von", "nach", "name"], "Nachrichtenfluss");
  vergleiche("daten", ["typ", "name", "lesen", "schreiben"], "Daten", (d) => datenRefs.get(d.id) || []);

  ergebnis.unveraendert = ergebnis.neu.length + ergebnis.geaendert.length + ergebnis.entfernt.length === 0;
  return ergebnis;
}

function ohneBeschreibungen(roh) {
  return { ...roh, elemente: (Array.isArray(roh.elemente) ? roh.elemente : []).map(({ beschreibung, ...rest }) => rest) };
}

// Sprachbefehl oder Antwort auf eine Frage: bestehendes Modell (JSON aus dem Editor) gezielt ändern
export async function aendereModell({ modellJson, anweisung, bezug = {}, model, llm = chatCompletion }) {
  const { modell: alt } = normalisiereModell(modellJson);
  const messages = [
    { role: "system", content: aenderungsPrompt() },
    { role: "user", content: aenderungsNachricht({ modell: ohneBeschreibungen(modellJson), anweisung, bezug }) }
  ];
  const ergebnis = await kiMitRegelcheck({ messages, model, llm });
  uebernehmeBeschreibungen(alt, ergebnis.modell);
  const vergleich = vergleicheModelle(alt, ergebnis.modell);
  const texte = Array.isArray(ergebnis.roh.aenderungen) ? ergebnis.roh.aenderungen.map((t) => String(t).trim()).filter(Boolean) : [];
  const rueckfrage = typeof ergebnis.roh.rueckfrage === "string" ? ergebnis.roh.rueckfrage.trim() : "";
  return {
    ...antwortAusErgebnis(ergebnis),
    aenderung: { ...vergleich, texte, rueckfrage }
  };
}
