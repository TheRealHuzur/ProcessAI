// Chatbot zu einem Prozess: antwortet nur aus dem hinterlegten Wissen der neuesten Version
// und nennt die Elemente, auf die sich die Antwort stützt (Fundstellen).
import { chatCompletion, extractJson, LlmError } from "./llm.js";
import { neuesModdle } from "./modell-lesen.js";
import { PPWissen } from "./wissen.js";

export class ChatFehler extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const TYPEN = {
  "bpmn:StartEvent": "Startereignis",
  "bpmn:IntermediateCatchEvent": "Zwischenereignis",
  "bpmn:IntermediateThrowEvent": "Zwischenereignis",
  "bpmn:EndEvent": "Endereignis",
  "bpmn:BoundaryEvent": "angeheftetes Ereignis",
  "bpmn:SubProcess": "Teilprozess",
  "bpmn:CallActivity": "Teilprozess",
  "bpmn:ExclusiveGateway": "Entscheidung (exklusiv)",
  "bpmn:ParallelGateway": "Verzweigung (parallel)",
  "bpmn:EventBasedGateway": "Entscheidung nach Ereignis",
  "bpmn:InclusiveGateway": "Entscheidung (inklusiv)"
};

export const MAX_FRAGE = 1000;
const MAX_VERLAUF = 4;

function text(wert) {
  return typeof wert === "string" ? wert.trim() : "";
}

function typName(bo) {
  if (TYPEN[bo.$type]) return TYPEN[bo.$type];
  return bo.$instanceOf("bpmn:Task") ? "Aufgabe" : bo.$type.replace("bpmn:", "");
}

function arbeitshilfe(bo) {
  return (bo.documentation || []).map((d) => d.text || "").join("\n\n").trim();
}

// Wissen aus dem BPMN-XML, auch aus dem Inneren von Teilprozessen.
// Ergebnis: { wissen (geht an die KI), elemente (id -> { name, typ }) für die Fundstellen }
export async function wissenAusXml(xml) {
  const { rootElement, elementsById } = await neuesModdle().fromXML(xml);
  const alle = Object.values(elementsById);

  const poolVonProzess = new Map();
  const beteiligte = [];
  for (const p of alle.filter((x) => x.$type === "bpmn:Participant")) {
    if (p.processRef) poolVonProzess.set(p.processRef.id, p.name || "");
    beteiligte.push({ id: p.id, name: p.name || "", eigenerAblauf: Boolean(p.processRef && (p.processRef.flowElements || []).length) });
  }

  // Nur Bahnen ohne Unterbahnen, sonst stünde ein Schritt in zwei Rollen
  const rolleVon = new Map();
  const rollen = [];
  for (const lane of alle.filter((x) => x.$type === "bpmn:Lane")) {
    if (lane.childLaneSet && (lane.childLaneSet.lanes || []).length) continue;
    rollen.push({ id: lane.id, name: lane.name || "" });
    for (const node of lane.flowNodeRef || []) rolleVon.set(node.id, lane.name || "");
  }

  function prozessVon(bo) {
    let x = bo.$parent;
    while (x && x.$type !== "bpmn:Process") x = x.$parent;
    return x;
  }

  function teilprozessVon(bo) {
    const eltern = bo.$parent;
    return eltern && eltern.$instanceOf && eltern.$instanceOf("bpmn:SubProcess") ? eltern.name || eltern.id : "";
  }

  // Reihenfolge aus den Sequenzflüssen; outgoing steht nicht in jeder Datei
  const ausgaenge = new Map();
  for (const f of alle.filter((x) => x.$type === "bpmn:SequenceFlow" && x.sourceRef && x.targetRef)) {
    ausgaenge.set(f.sourceRef.id, [...(ausgaenge.get(f.sourceRef.id) || []), f]);
  }

  const elemente = new Map();
  const schritte = [];
  for (const bo of alle) {
    if (!bo.$instanceOf || !bo.$instanceOf("bpmn:FlowNode")) continue;
    const prozess = prozessVon(bo);
    const eintrag = {
      id: bo.id,
      typ: typName(bo),
      name: bo.name || "",
      ...(rolleVon.get(bo.id) ? { rolle: rolleVon.get(bo.id) } : {}),
      ...(prozess && poolVonProzess.get(prozess.id) ? { pool: poolVonProzess.get(prozess.id) } : {}),
      ...(teilprozessVon(bo) ? { im_teilprozess: teilprozessVon(bo) } : {}),
      ...(arbeitshilfe(bo) ? { arbeitshilfe: arbeitshilfe(bo) } : {}),
      danach: (ausgaenge.get(bo.id) || []).map((f) => (f.name ? `${f.name}: ` : "") + (f.targetRef.name || f.targetRef.id))
    };
    if (bo.$instanceOf("bpmn:Activity")) {
      const wissen = PPWissen.lesen(bo);
      for (const f of PPWissen.FELDER) if (wissen[f.key].length) eintrag[f.key] = wissen[f.key];
      const liest = (bo.dataInputAssociations || []).flatMap((a) => a.sourceRef || []).map((d) => d.name || d.id);
      const schreibt = (bo.dataOutputAssociations || []).map((a) => a.targetRef).filter(Boolean).map((d) => d.name || d.id);
      if (liest.length) eintrag.liest = liest;
      if (schreibt.length) eintrag.schreibt = schreibt;
    }
    if (!eintrag.danach.length) delete eintrag.danach;
    schritte.push(eintrag);
    elemente.set(bo.id, { name: bo.name || "", typ: eintrag.typ });
  }
  for (const r of rollen) elemente.set(r.id, { name: r.name, typ: "Rolle" });
  for (const b of beteiligte) elemente.set(b.id, { name: b.name, typ: "Beteiligter" });

  const nachrichten = alle.filter((x) => x.$type === "bpmn:MessageFlow").map((m) => ({
    name: m.name || "",
    von: (m.sourceRef && (m.sourceRef.name || m.sourceRef.id)) || "",
    nach: (m.targetRef && (m.targetRef.name || m.targetRef.id)) || ""
  }));

  return {
    wissen: { beteiligte, rollen, schritte, ...(nachrichten.length ? { nachrichten } : {}) },
    elemente,
    hatAblauf: schritte.length > 0 && Boolean(rootElement)
  };
}

function systemPrompt(prozessname, wissen) {
  return `Du bist der Chatbot von ProzessPilot und beantwortest Fragen zum Prozess „${prozessname}“.

Regeln:
- Antworte nur aus dem hinterlegten Wissen unten: Schritte des Prozessmodells mit Rollen, Reihenfolge („danach“), Arbeitshilfen, Dokumenten und Vorlagen, Ansprechpersonen, Rechtsgrundlagen und Daten. Nutze kein Wissen von außerhalb, rate nicht und ergänze nichts.
- Steht die Antwort nicht oder nur teilweise im Wissen, sag das offen und nenne, was fehlt. Setze dann "beantwortet" auf false.
- Nenne in "fundstellen" die id jedes Elements, auf das sich deine Antwort stützt (Schritte, Ereignisse, Entscheidungen, Rollen). Nur ids aus dem Wissen, die wichtigste zuerst.
- Schreib auf Deutsch in einfacher Alltagssprache, kurz und konkret, ohne Gedankenstriche. Nenne Rollen, nie Personennamen.
- Antworte ausschließlich mit JSON: {"antwort": "...", "beantwortet": true, "fundstellen": ["id"]}

Hinterlegtes Wissen (JSON):
${JSON.stringify(wissen)}`;
}

function verlaufAus(roh) {
  if (!Array.isArray(roh)) return [];
  return roh.slice(-MAX_VERLAUF).flatMap((eintrag) => {
    const frage = text(eintrag && eintrag.frage).slice(0, MAX_FRAGE);
    const antwort = text(eintrag && eintrag.antwort).slice(0, 2000);
    if (!frage || !antwort) return [];
    return [
      { role: "user", content: frage },
      { role: "assistant", content: JSON.stringify({ antwort }) }
    ];
  });
}

// llm ist austauschbar (für Tests): async ({ model, messages }) => { content }
export async function beantworteFrage({ prozess, frage, verlauf = [], model, llm = chatCompletion }) {
  const stand = prozess && prozess.aktuell;
  if (!stand) throw new ChatFehler(404, "Prozess nicht gefunden.");
  let gelesen;
  try {
    gelesen = await wissenAusXml(stand.bpmn_xml);
  } catch {
    throw new ChatFehler(422, "Das gespeicherte Modell ist nicht lesbar.");
  }
  if (!gelesen.hatAblauf) throw new ChatFehler(422, "Der Prozess hat noch keine Schritte, zu denen der Chatbot etwas sagen könnte.");

  const messages = [
    { role: "system", content: systemPrompt(prozess.name, gelesen.wissen) },
    ...verlaufAus(verlauf),
    { role: "user", content: frage }
  ];
  const { content } = await llm({ model, messages, temperature: 0.1 });
  const roh = extractJson(content);
  const antwort = text(roh && roh.antwort);
  if (!antwort) throw new LlmError("Die KI hat keine Antwort geliefert.");

  // Nur Fundstellen, die es im Modell gibt, jede einmal
  const ids = [...new Set((Array.isArray(roh.fundstellen) ? roh.fundstellen : []).map((id) => text(String(id ?? ""))))];
  const fundstellen = ids.filter((id) => gelesen.elemente.has(id)).map((id) => ({ id, ...gelesen.elemente.get(id) }));

  return {
    antwort,
    beantwortet: roh.beantwortet !== false,
    fundstellen,
    prozess: { id: prozess.id, name: prozess.name, version: stand.version }
  };
}
