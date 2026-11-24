// Handbuch, Stufe 2: Gliederung als PDF (Deckblatt, Inhaltsverzeichnis, Kapitel).
// Gemeinsamer Kern für ProzessPilot und Kundenportal, ohne Datenbank, Anmeldung oder KI.
import pdfmake from "pdfmake";
import "../../public/wissen.js";
import { einzeilig, leseHandbuch } from "./lesen.js";

const PPWissen = globalThis.PPWissen;

const SCHRIFTEN = { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" };
pdfmake.setFonts({ Helvetica: SCHRIFTEN });
// Nur die eingebauten PDF-Schriften, keine Dateien und keine Adressen nachladen
pdfmake.setLocalAccessPolicy((pfad) => Object.values(SCHRIFTEN).includes(pfad));
pdfmake.setUrlAccessPolicy(() => false);

const FARBE = { akzent: "#0a7d94", text: "#0f1c2e", grau: "#4e6680", linie: "#c9d8e6" };

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

// Optionen: name (Titel statt Modellname), version, stand, organisation (über dem Titel),
// erstelltMit (letzte Zeile auf dem Deckblatt), fusshinweis (Mitte der Fußzeile auf jeder Seite).
export function handbuchDokument(handbuch, {
  name = "",
  version = null,
  stand = datumHeute(),
  organisation = "",
  erstelltMit = "Erstellt mit ProzessPilot",
  fusshinweis = ""
} = {}) {
  const titel = einzeilig(name) || handbuch.titel || "Prozess";
  const org = einzeilig(organisation);
  const deckblatt = [
    { text: "Handbuch", style: "deckLabel", margin: [0, org ? 150 : 170, 0, 8] },
    ...(org ? [{ text: org, style: "deckOrganisation" }] : []),
    { text: titel, style: "deckTitel" },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 3, lineColor: FARBE.akzent }], margin: [0, 18, 0, 18] },
    ...(handbuch.einfuehrung ? absaetze(handbuch.einfuehrung) : []),
    {
      stack: [
        `Stand: ${stand}`,
        ...(version ? [`Version ${version}`] : []),
        ...(erstelltMit ? [erstelltMit] : [])
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
        ...(fusshinweis ? [{ text: fusshinweis, alignment: "center", color: FARBE.grau }] : []),
        { text: `Seite ${seite} von ${seiten}`, alignment: "right", color: FARBE.grau }
      ],
      fontSize: 8,
      margin: [64, 24, 64, 0]
    }),
    // Überschrift nie allein am Seitenende
    pageBreakBefore: (knoten, abfrage) => Boolean(knoten.headlineLevel) && abfrage.getFollowingNodesOnPage().length === 0,
    styles: {
      deckLabel: { fontSize: 13, bold: true, color: FARBE.akzent, characterSpacing: 1 },
      deckOrganisation: { fontSize: 12, color: FARBE.grau, margin: [0, 0, 0, 6] },
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
