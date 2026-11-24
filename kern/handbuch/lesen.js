// Handbuch, Stufe 1: BPMN-XML lesen und zur Gliederung machen (Kapitel je Schwimmbahn,
// Teilprozesse als eigene Ebene: Schwimmbahn > Teilprozess > Aktivität; hat der Inhalt eines
// Teilprozesses mehrere Bahnen, kommt je Bahn eine Ebene dazwischen).
// Exporte aus PICTURE werden über picture.js zusammengeführt.
// Gemeinsamer Kern für ProzessPilot und Kundenportal: Daten rein, Daten raus,
// ohne Datenbank, Anmeldung, Einstellungen oder KI.
import BpmnModdle from "bpmn-moddle";
import "../../public/wissen.js";
import { pictureTeilprozesse, pictureBeschreibung, pictureAufrufZiel, pictureHatUnterdiagramm } from "./picture.js";

const PPWissen = globalThis.PPWissen;

export class HandbuchFehler extends Error {}

export function einzeilig(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// Text am Schritt: BPMN-Feld documentation; nur wenn es fehlt, das Beschreibungsfeld aus PICTURE
// (PICTURE exportiert die Beschreibung in beide Felder, einmal schlicht, einmal als HTML)
// Einrückung der ersten Zeile bleibt erhalten, sonst wird ein " - Punkt" am Anfang zur höheren Listenebene
function ohneRaender(text) {
  return text.trim() ? text.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/\s+$/, "") : "";
}

function arbeitshilfe(bo) {
  return ohneRaender((bo.documentation || []).map((d) => d.text || "").join("\n\n")) || pictureBeschreibung(bo);
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

  const wurzeln = definitions.rootElements || [];
  const alleProzesse = wurzeln.filter((r) => r.$type === "bpmn:Process");
  // PICTURE: Teilprozess -> Prozess mit seinem Inhalt; diese Prozesse sind keine eigenen Kapitel
  const teilprozessInhalt = pictureTeilprozesse(definitions);
  const inhaltsProzesse = new Set(teilprozessInhalt.values());

  // Name des Modells, das eine Aufrufaktivität aufruft
  const aufrufName = (bo) => {
    const gerufen = typeof bo.calledElement === "string" ? alleProzesse.find((p) => p.id === bo.calledElement) : null;
    return einzeilig(pictureAufrufZiel(bo) || (gerufen && gerufen.name) || bo.name);
  };

  // Schritte im Inneren eines Teilprozesses; mehr als eine Bahn mit Schritten: je Bahn eine Ebene
  const inhalt = (container, besucht) => {
    const aktivitaeten = (container.flowElements || []).filter(istAktivitaet);
    const gruppen = [];
    const zugeordnet = new Set();
    for (const bahn of (container.laneSets || []).flatMap((ls) => blattBahnen(ls))) {
      const ids = new Set((bahn.flowNodeRef || []).map((n) => n.id));
      const inBahn = aktivitaeten.filter((a) => ids.has(a.id));
      inBahn.forEach((a) => zugeordnet.add(a.id));
      if (inBahn.length) gruppen.push({ name: einzeilig(bahn.name) || "Schwimmbahn ohne Namen", liste: inBahn });
    }
    const rest = aktivitaeten.filter((a) => !zugeordnet.has(a.id));
    if (rest.length && gruppen.length) gruppen.push({ name: "Ohne Schwimmbahn", liste: rest });
    if (gruppen.length < 2) return sortiert(aktivitaeten).map((a) => eintrag(a, besucht));
    return gruppen.map((g) => ({ art: "bahn", id: "", name: g.name, arbeitshilfe: "", hinweis: "", wissen: PPWissen.leer(), eintraege: sortiert(g.liste).map((a) => eintrag(a, besucht)) }));
  };

  function eintrag(bo, besucht = new Set()) {
    const teilprozess = istTeilprozess(bo);
    let eintraege = [];
    if (teilprozess) {
      const container = (bo.flowElements || []).some(istAktivitaet) ? bo : teilprozessInhalt.get(bo.id);
      if (container && !besucht.has(container)) eintraege = inhalt(container, new Set([...besucht, container]));
    }
    return {
      art: teilprozess ? "teilprozess" : "aufgabe",
      id: bo.id,
      name: einzeilig(bo.name),
      arbeitshilfe: arbeitshilfe(bo),
      hinweis: !eintraege.length && (bo.$instanceOf("bpmn:CallActivity") || pictureHatUnterdiagramm(bo))
        ? `Siehe Modell „${(bo.$instanceOf("bpmn:CallActivity") ? aufrufName(bo) : einzeilig(bo.name)) || "ohne Namen"}“`
        : "",
      wissen: PPWissen.lesen(bo),
      eintraege
    };
  }

  const kollaboration = wurzeln.find((r) => r.$type === "bpmn:Collaboration");
  const teilnehmerVon = new Map(((kollaboration && kollaboration.participants) || []).filter((p) => p.processRef).map((p) => [p.processRef.id, p]));
  const mitSchritten = alleProzesse.filter((r) => (r.flowElements || []).some(istAktivitaet));
  const hauptprozesse = mitSchritten.filter((r) => !inhaltsProzesse.has(r));
  const prozesse = hauptprozesse.length ? hauptprozesse : mitSchritten;

  const kapitel = [];
  let einfuehrung = "";
  for (const prozess of prozesse) {
    const teilnehmer = teilnehmerVon.get(prozess.id);
    const poolName = einzeilig((teilnehmer && teilnehmer.name) || prozess.name);
    const zusatz = prozesse.length > 1 && poolName ? ` (${poolName})` : "";
    if (!einfuehrung) einfuehrung = (teilnehmer && arbeitshilfe(teilnehmer)) || arbeitshilfe(prozess) || (kollaboration ? arbeitshilfe(kollaboration) : "");

    const aktivitaeten = (prozess.flowElements || []).filter(istAktivitaet);
    const bahnen = (prozess.laneSets || []).flatMap((ls) => blattBahnen(ls));
    const zugeordnet = new Set();
    for (const bahn of bahnen) {
      const ids = new Set((bahn.flowNodeRef || []).map((n) => n.id));
      const inBahn = aktivitaeten.filter((a) => ids.has(a.id));
      inBahn.forEach((a) => zugeordnet.add(a.id));
      if (inBahn.length) kapitel.push({ titel: (einzeilig(bahn.name) || "Schwimmbahn ohne Namen") + zusatz, eintraege: sortiert(inBahn).map((a) => eintrag(a, new Set([prozess]))) });
    }
    const rest = aktivitaeten.filter((a) => !zugeordnet.has(a.id));
    if (rest.length) {
      const titel = bahnen.length ? `Ohne Schwimmbahn${zusatz}` : poolName || "Prozess";
      kapitel.push({ titel, eintraege: sortiert(rest).map((a) => eintrag(a, new Set([prozess]))) });
    }
  }
  if (!kapitel.length) throw new HandbuchFehler("Das Modell enthält noch keine Aufgaben oder Teilprozesse.");

  const hauptTeilnehmer = prozesse.length ? teilnehmerVon.get(prozesse[0].id) : null;
  const titel = einzeilig((hauptTeilnehmer && hauptTeilnehmer.name) || (prozesse[0] && prozesse[0].name));
  return { titel, einfuehrung, kapitel };
}
