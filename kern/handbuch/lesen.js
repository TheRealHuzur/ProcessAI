// Handbuch, Stufe 1: BPMN-XML lesen und zur Gliederung machen (Kapitel je Schwimmbahn,
// Teilprozesse als eigene Ebene: Schwimmbahn > Teilprozess > Aktivität).
// Gemeinsamer Kern für ProzessPilot und Kundenportal: Daten rein, Daten raus,
// ohne Datenbank, Anmeldung, Einstellungen oder KI.
import BpmnModdle from "bpmn-moddle";
import "../../public/wissen.js";

const PPWissen = globalThis.PPWissen;

export class HandbuchFehler extends Error {}

export function einzeilig(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function arbeitshilfe(bo) {
  return (bo.documentation || []).map((d) => d.text || "").join("\n\n").trim();
}

function istAktivitaet(bo) {
  return bo.$instanceOf("bpmn:Activity");
}

// Teilprozess: zugeklappter oder aufgeklappter Teilprozess, auch Aufruf eines anderen Prozesses
function istTeilprozess(bo) {
  return bo.$instanceOf("bpmn:SubProcess") || bo.$instanceOf("bpmn:CallActivity");
}

function blattBahnen(laneSet, liste = []) {
  for (const lane of (laneSet && laneSet.lanes) || []) {
    if (lane.childLaneSet && (lane.childLaneSet.lanes || []).length) blattBahnen(lane.childLaneSet, liste);
    else liste.push(lane);
  }
  return liste;
}

// Lage im Diagramm (alle Ebenen, auch die Ebenen von Teilprozessen) für die Lesereihenfolge
function lagen(definitions) {
  const lage = new Map();
  for (const diagramm of definitions.diagrams || []) {
    for (const form of (diagramm.plane && diagramm.plane.planeElement) || []) {
      if (form.bpmnElement && form.bounds) lage.set(form.bpmnElement.id, form.bounds);
    }
  }
  return lage;
}

// Aus dem XML die Gliederung des Handbuchs lesen
export async function leseHandbuch(xml) {
  let definitions;
  try {
    ({ rootElement: definitions } = await new BpmnModdle({ pp: PPWissen.descriptor }).fromXML(xml));
  } catch {
    throw new HandbuchFehler("Das Modell ist kein gültiges BPMN-XML.");
  }
  const lage = lagen(definitions);
  const sortiert = (liste) => liste
    .map((bo, i) => ({ bo, i, b: lage.get(bo.id) }))
    .sort((a, b) => (a.b ? 0 : 1) - (b.b ? 0 : 1) || (a.b && b.b ? a.b.x - b.b.x || a.b.y - b.b.y : 0) || a.i - b.i)
    .map((x) => x.bo);

  const eintrag = (bo) => {
    const teilprozess = istTeilprozess(bo);
    return {
      art: teilprozess ? "teilprozess" : "aufgabe",
      id: bo.id,
      name: einzeilig(bo.name),
      arbeitshilfe: arbeitshilfe(bo),
      wissen: PPWissen.lesen(bo),
      eintraege: teilprozess ? sortiert((bo.flowElements || []).filter(istAktivitaet)).map(eintrag) : []
    };
  };

  const wurzeln = definitions.rootElements || [];
  const kollaboration = wurzeln.find((r) => r.$type === "bpmn:Collaboration");
  const teilnehmerVon = new Map(((kollaboration && kollaboration.participants) || []).filter((p) => p.processRef).map((p) => [p.processRef.id, p]));
  const prozesse = wurzeln.filter((r) => r.$type === "bpmn:Process" && (r.flowElements || []).some(istAktivitaet));

  const kapitel = [];
  let einfuehrung = "";
  for (const prozess of prozesse) {
    const teilnehmer = teilnehmerVon.get(prozess.id);
    const poolName = einzeilig((teilnehmer && teilnehmer.name) || prozess.name);
    const zusatz = prozesse.length > 1 && poolName ? ` (${poolName})` : "";
    if (!einfuehrung) einfuehrung = (teilnehmer && arbeitshilfe(teilnehmer)) || arbeitshilfe(prozess);

    const aktivitaeten = (prozess.flowElements || []).filter(istAktivitaet);
    const bahnen = (prozess.laneSets || []).flatMap((ls) => blattBahnen(ls));
    const zugeordnet = new Set();
    for (const bahn of bahnen) {
      const ids = new Set((bahn.flowNodeRef || []).map((n) => n.id));
      const inBahn = aktivitaeten.filter((a) => ids.has(a.id));
      inBahn.forEach((a) => zugeordnet.add(a.id));
      if (inBahn.length) kapitel.push({ titel: (einzeilig(bahn.name) || "Schwimmbahn ohne Namen") + zusatz, eintraege: sortiert(inBahn).map(eintrag) });
    }
    const rest = aktivitaeten.filter((a) => !zugeordnet.has(a.id));
    if (rest.length) {
      const titel = bahnen.length ? `Ohne Schwimmbahn${zusatz}` : poolName || "Prozess";
      kapitel.push({ titel, eintraege: sortiert(rest).map(eintrag) });
    }
  }
  if (!kapitel.length) throw new HandbuchFehler("Das Modell enthält noch keine Aufgaben oder Teilprozesse.");

  const hauptTeilnehmer = prozesse.length ? teilnehmerVon.get(prozesse[0].id) : null;
  const titel = einzeilig((hauptTeilnehmer && hauptTeilnehmer.name) || (prozesse[0] && prozesse[0].name));
  return { titel, einfuehrung, kapitel };
}
