// Handbuch als PDF: Deckblatt, Inhaltsverzeichnis, ein Kapitel je Schwimmbahn mit ihren Aktivitäten.
// Teilprozesse bilden eine eigene Ebene mit ihren Aktivitäten darunter (Schwimmbahn > Teilprozess > Aktivität).
// Grundlage ist das BPMN-XML aus dem Editor, damit auch ungespeicherte und fremde Modelle gehen.
import BpmnModdle from "bpmn-moddle";
import pdfmake from "pdfmake";
import { PPWissen } from "./wissen.js";

const SCHRIFTEN = { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" };
pdfmake.setFonts({ Helvetica: SCHRIFTEN });
// Nur die eingebauten PDF-Schriften, keine Dateien und keine Adressen nachladen
pdfmake.setLocalAccessPolicy((pfad) => Object.values(SCHRIFTEN).includes(pfad));
pdfmake.setUrlAccessPolicy(() => false);

const FARBE = { akzent: "#0a7d94", text: "#0f1c2e", grau: "#4e6680", linie: "#c9d8e6" };

export class HandbuchFehler extends Error {}

function einzeilig(text) {
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

// ---------- PDF ----------

const URL_MUSTER = /(https?:\/\/[^\s]+)/g;

function mitLinks(zeile) {
  return zeile.split(URL_MUSTER).filter(Boolean).map((teil) => (/^https?:\/\//.test(teil) ? { text: teil, link: teil, color: FARBE.akzent } : teil));
}

function absaetze(text) {
  return text.split(/\n\s*\n/).map((absatz) => ({ text: absatz.trim(), style: "absatz" })).filter((a) => a.text);
}

function ueberschrift(nummer, text, ebene) {
  const stil = ["kapitel", "abschnitt", "unterabschnitt", "unterabschnitt"][Math.min(ebene - 1, 3)];
  const knoten = { text: `${nummer}  ${text}`, style: stil, headlineLevel: ebene };
  if (ebene <= 3) Object.assign(knoten, { tocItem: true, tocMargin: [(ebene - 1) * 14, ebene === 1 ? 6 : 1, 0, 0], tocStyle: ebene === 1 ? "tocKapitel" : "tocEintrag" });
  return knoten;
}

function eintragInhalt(e, nummer, ebene) {
  const inhalt = [ueberschrift(nummer, e.name || "Ohne Namen", ebene)];
  if (e.art === "teilprozess") inhalt.push({ text: "Teilprozess", style: "kennzeichen" });
  if (e.arbeitshilfe) inhalt.push(...absaetze(e.arbeitshilfe));
  for (const f of PPWissen.FELDER) {
    const werte = e.wissen[f.key] || [];
    if (!werte.length) continue;
    inhalt.push({ text: f.titel, style: "feldTitel" }, { ul: werte.map((w) => ({ text: mitLinks(w) })), style: "liste" });
  }
  const hatInhalt = e.arbeitshilfe || !PPWissen.istLeer(e.wissen);
  if (!hatInhalt && !e.eintraege.length) inhalt.push({ text: "Noch keine Arbeitshilfe hinterlegt.", style: "fehlt" });
  e.eintraege.forEach((kind, i) => inhalt.push(...eintragInhalt(kind, `${nummer}.${i + 1}`, ebene + 1)));
  return inhalt;
}

function datumHeute() {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

export function handbuchDokument(handbuch, { name = "", version = null, stand = datumHeute() } = {}) {
  const titel = einzeilig(name) || handbuch.titel || "Prozess";
  const deckblatt = [
    { text: "Handbuch", style: "deckLabel", margin: [0, 170, 0, 8] },
    { text: titel, style: "deckTitel" },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 3, lineColor: FARBE.akzent }], margin: [0, 18, 0, 18] },
    ...(handbuch.einfuehrung ? absaetze(handbuch.einfuehrung) : []),
    {
      stack: [
        `Stand: ${stand}`,
        ...(version ? [`Version ${version}`] : []),
        "Erstellt mit ProzessPilot"
      ],
      style: "deckFuss",
      margin: [0, 60, 0, 0]
    }
  ];
  const kapitel = handbuch.kapitel.flatMap((k, i) => {
    const nummer = String(i + 1);
    return [
      { ...ueberschrift(nummer, k.titel, 1), pageBreak: "before" },
      ...k.eintraege.flatMap((e, j) => eintragInhalt(e, `${nummer}.${j + 1}`, 2))
    ];
  });

  return {
    pageSize: "A4",
    pageMargins: [64, 60, 64, 64],
    info: { title: `Handbuch ${titel}`, creator: "ProzessPilot", producer: "ProzessPilot" },
    defaultStyle: { font: "Helvetica", fontSize: 10.5, lineHeight: 1.3, color: FARBE.text },
    content: [
      ...deckblatt,
      { text: "Inhalt", style: "kapitel", pageBreak: "before" },
      { toc: { numberStyle: { color: FARBE.grau } } },
      ...kapitel
    ],
    footer: (seite, seiten) => (seite === 1 ? null : {
      columns: [
        { text: titel, color: FARBE.grau },
        { text: `Seite ${seite} von ${seiten}`, alignment: "right", color: FARBE.grau }
      ],
      fontSize: 8,
      margin: [64, 24, 64, 0]
    }),
    // Überschrift nie allein am Seitenende
    pageBreakBefore: (knoten, abfrage) => Boolean(knoten.headlineLevel) && abfrage.getFollowingNodesOnPage().length === 0,
    styles: {
      deckLabel: { fontSize: 13, bold: true, color: FARBE.akzent, characterSpacing: 1 },
      deckTitel: { fontSize: 28, bold: true, lineHeight: 1.1 },
      deckFuss: { fontSize: 10, color: FARBE.grau, lineHeight: 1.6 },
      kapitel: { fontSize: 18, bold: true, color: FARBE.akzent, margin: [0, 0, 0, 14] },
      abschnitt: { fontSize: 13, bold: true, margin: [0, 16, 0, 4] },
      unterabschnitt: { fontSize: 11.5, bold: true, margin: [0, 12, 0, 3] },
      kennzeichen: { fontSize: 8.5, bold: true, color: FARBE.akzent, margin: [0, 0, 0, 4] },
      absatz: { margin: [0, 0, 0, 6] },
      feldTitel: { fontSize: 9, bold: true, color: FARBE.grau, margin: [0, 4, 0, 2] },
      liste: { margin: [0, 0, 0, 4] },
      fehlt: { italics: true, color: FARBE.grau, margin: [0, 0, 0, 6] },
      tocKapitel: { bold: true },
      tocEintrag: { fontSize: 10 }
    }
  };
}

export async function erzeugeHandbuch(xml, optionen = {}) {
  const handbuch = await leseHandbuch(xml);
  return pdfmake.createPdf(handbuchDokument(handbuch, optionen)).getBuffer();
}
