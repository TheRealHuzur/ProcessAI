// Ablauf "Modell erzeugen":
// Text -> KI (JSON) -> Bereinigung -> Regelcheck -> ggf. eine Korrekturrunde -> Anordnung -> BPMN-XML
import { chatCompletion, extractJson, LlmError } from "./llm.js";
import { systemPrompt, nutzerNachricht, korrekturNachricht } from "./prompt.js";
import { normalisiereModell } from "./modell.js";
import { pruefeModell } from "./regelcheck.js";
import { anordnen } from "./layout.js";
import { erzeugeBpmnXml } from "./bpmn-xml.js";

const MAX_KORREKTUREN = 1;

// Modell aus JSON bauen, ohne KI. Wird auch von Tests verwendet.
export function bauenAusJson(roh) {
  const { modell, probleme } = normalisiereModell(roh);
  const pruefung = pruefeModell(modell);
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
