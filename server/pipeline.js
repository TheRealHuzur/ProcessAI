// Ablauf "Modell erzeugen":
// Text -> KI (JSON) -> Bereinigung -> Regelcheck -> ggf. eine Korrekturrunde -> Anordnung -> BPMN-XML
import { chatCompletion, extractJson, LlmError } from "./llm.js";
import { systemPrompt, nutzerNachricht, korrekturNachricht } from "./prompt.js";
import { normalisiereModell } from "./modell.js";
import { pruefeModell } from "./regelcheck.js";
import { anordnen } from "./layout.js";
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

// Modell aus JSON bauen, ohne KI. Wird auch von Tests verwendet.
export function bauenAusJson(roh) {
  const { modell, probleme } = normalisiereModell(roh);
  const automatisch = ergaenzeZusammenfuehrungen(modell);
  const pruefung = pruefeModell(modell);
  pruefung.hinweise = [...automatisch, ...pruefung.hinweise];
  return { modell, probleme, pruefung };
}

export function zuXml(modell) {
  const layout = anordnen(modell);
  return erzeugeBpmnXml(modell, layout);
}

// llm ist austauschbar (für Tests): async ({ model, messages }) => { content }
export async function erzeugeModell({ text, prozessname, model, llm = chatCompletion }) {
  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: nutzerNachricht({ prozessname, text }) }
  ];

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

  const xml = zuXml(ergebnis.modell);
  return {
    xml,
    prozessname: ergebnis.modell.prozessname,
    modellJson: ergebnis.roh,
    pruefung: { fehler: ergebnis.alleFehler, hinweise: ergebnis.pruefung.hinweise },
    unklarheiten: ergebnis.modell.unklarheiten,
    nichtModelliert: ergebnis.modell.nichtModelliert,
    korrigiert,
    protokoll
  };
}
