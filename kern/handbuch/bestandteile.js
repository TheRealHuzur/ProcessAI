// Bestandteile hochgeladener BPMN-Dateien: Was steckt drin, was davon nutzt das Handbuch?
// Für die Auswertung im Hintergrund (welche Elemente, Erweiterungen und Herstellerfelder kommen vor,
// die der Einleser noch ignoriert). Ohne Datenbank und Anmeldung, wie der übrige Kern.
import BpmnModdle from "bpmn-moddle";
import "../../public/wissen.js";
import { pictureFelder } from "./picture.js";

const PPWissen = globalThis.PPWissen;
const MAX_EINTRAEGE = 200;

// Im Handbuch bewusst nicht beschrieben: Ereignisse, Gateways, Flüsse (Entscheidung 24.11.2026)
const WEGGELASSEN = /(Event|EventDefinition|Gateway)$|^bpmn:(SequenceFlow|MessageFlow|FormalExpression|Expression)$/;
// Vom Handbuch gelesen: Struktur (Pools, Bahnen), Aktivitäten, Beschreibung
const GENUTZT = /^bpmn:(Definitions|Collaboration|Participant|Process|LaneSet|Lane|Documentation|ExtensionElements)$/;
// Platzhalter in Herstellerfeldern zählen nicht als Inhalt; Darstellungsfelder interessieren nicht
const PLATZHALTER = /^(kein eintrag|no entry|false|0|0[.,]0+|none|null|-)?$/i;
const DARSTELLUNG = /colou?r|font|position|size|width|height|visuali[sz]|display|representation|watermark|boundary|^a_order$/i;

const hatInhalt = (wert) => !PLATZHALTER.test(String(wert ?? "").replace(/\s+/g, " ").trim());

function zaehle(ziel, schluessel, menge = 1) {
  if (!(schluessel in ziel) && Object.keys(ziel).length >= MAX_EINTRAEGE) return;
  ziel[schluessel] = (ziel[schluessel] || 0) + menge;
}

// Generische Kinder eines fremden Elements (bpmn-moddle kennt den Namensraum nicht)
const kinder = (o) => (o && (o.$children || o.values)) || [];

// ADONIS: <adonis:attribute name="..."><adonis:value>...</adonis:value>, beliebig tief verschachtelt
function adonisFelder(element, ziel) {
  for (const kind of kinder(element)) {
    if (kind.$type === "adonis:attribute" && kind.name && !DARSTELLUNG.test(kind.name)) {
      const wert = kinder(kind).find((c) => c.$type === "adonis:value");
      if (wert && hatInhalt(wert.$body)) zaehle(ziel, `ADONIS: ${kind.name}`);
    }
    adonisFelder(kind, ziel);
  }
}

// Eine oder mehrere Dateien (Texte oder { name, xml }); Ergebnis zum Ablegen als JSON
export async function bestandteile(dateien) {
  const liste = (Array.isArray(dateien) ? dateien : [dateien]).map((d) => (typeof d === "string" ? d : d.xml));
  const erg = { genutzt: {}, weggelassen: {}, ungenutzt: {}, fremd: {}, felder: {}, genutzte_felder: {}, warnungen: 0 };
  for (const xml of liste) {
    let gelesen;
    try {
      gelesen = await new BpmnModdle({ pp: PPWissen.descriptor }).fromXML(String(xml || ""));
    } catch {
      continue;
    }
    erg.warnungen += (gelesen.warnings || []).length;
    const gesehen = new Set();
    const besuche = (o) => {
      if (!o || typeof o !== "object" || gesehen.has(o)) return;
      gesehen.add(o);
      if (Array.isArray(o)) return o.forEach(besuche);
      const typ = o.$type || "";
      if (typ.startsWith("bpmn:")) {
        const art = o.$instanceOf && o.$instanceOf("bpmn:Activity") ? "genutzt"
          : GENUTZT.test(typ) ? "genutzt" : WEGGELASSEN.test(typ) ? "weggelassen" : "ungenutzt";
        zaehle(erg[art], typ);
      }
      for (const [k, v] of Object.entries(o.$attrs || {})) {
        if (k.includes(":") && !/^(xmlns|xsi:)/.test(k)) zaehle(erg.fremd, `@${k}`);
      }
      if (o.extensionElements) {
        for (const e of kinder(o.extensionElements)) {
          if (e.$type && !e.$type.startsWith("pp:")) zaehle(erg.fremd, e.$type);
          if (String(e.$type).startsWith("adonis:")) adonisFelder({ $children: [e] }, erg.felder);
        }
        for (const f of pictureFelder(o)) {
          if (f.typ === "color" || !(hatInhalt(f.wert) || f.referenzen.length)) continue;
          const name = `PICTURE: ${f.gruppe ? `${f.gruppe} / ` : ""}${f.name || f.id}`;
          const genutzt = f.id === "subDiagramLink" || /processLink/i.test(f.id) || /beschreibung|description/i.test(f.id) || /^beschreibung$/i.test(String(f.name).trim());
          zaehle(genutzt ? erg.genutzte_felder : erg.felder, name);
        }
      }
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith("$") || k === "extensionElements" || k === "di") continue;
        if (v && typeof v === "object") besuche(v);
      }
    };
    besuche(gelesen.rootElement.rootElements || []);
  }
  return erg;
}
