// Kommentare und Ergänzungsvorschläge am Schritt (Phase 8).
// Ein übernommener Vorschlag wird an die Arbeitshilfe des Schritts angehängt und ergibt eine neue Version.
import { neuesModdle } from "./modell-lesen.js";

export class KommentarFehler extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ARTEN = ["kommentar", "vorschlag"];
export const MAX_TEXT = 4000;

// Kommentiert werden Schritte, Ereignisse und Gateways der neuesten gespeicherten Version
async function schrittImModell(xml, elementId) {
  const { elementsById } = await neuesModdle().fromXML(xml);
  const bo = elementsById[elementId];
  return bo && bo.$instanceOf && bo.$instanceOf("bpmn:FlowNode") ? bo : null;
}

export async function neuerKommentar(db, prozessId, { elementId, art, text, konto }) {
  const prozess = db.holeProzess(prozessId);
  if (!prozess || !prozess.aktuell) throw new KommentarFehler(404, "Prozess nicht gefunden.");
  if (!ARTEN.includes(art)) throw new KommentarFehler(400, "Unbekannte Art (kommentar oder vorschlag).");
  if (!text) throw new KommentarFehler(400, "Bitte einen Text eingeben.");
  if (text.length > MAX_TEXT) throw new KommentarFehler(400, `Der Text ist zu lang (höchstens ${MAX_TEXT} Zeichen).`);
  const bo = await schrittImModell(prozess.aktuell.bpmn_xml, elementId);
  if (!bo) throw new KommentarFehler(409, "Diesen Schritt gibt es in der gespeicherten Version nicht. Bitte zuerst speichern.");
  return db.speichereKommentar({ prozessId: prozess.id, elementId, elementName: bo.name || "", art, text, verfasstVon: konto });
}

// aktion: uebernehmen (nur Vorschläge), erledigt (nur Kommentare), ablehnen (beide)
export async function entscheide(db, kommentarId, { aktion, text, konto }) {
  const kommentar = db.holeKommentar(kommentarId);
  if (!kommentar) throw new KommentarFehler(404, "Eintrag nicht gefunden.");
  if (kommentar.status !== "offen") throw new KommentarFehler(409, "Darüber wurde schon entschieden.");
  const endText = text || kommentar.text;
  if (endText.length > MAX_TEXT) throw new KommentarFehler(400, `Der Text ist zu lang (höchstens ${MAX_TEXT} Zeichen).`);

  if (aktion === "ablehnen" || (aktion === "erledigt" && kommentar.art === "kommentar")) {
    db.entscheideKommentar(kommentar.id, { status: aktion === "ablehnen" ? "abgelehnt" : "erledigt", text: endText, entschiedenVon: konto });
    return { kommentar: db.holeKommentar(kommentar.id), version: null };
  }
  if (aktion !== "uebernehmen" || kommentar.art !== "vorschlag") {
    throw new KommentarFehler(400, "Vorschläge lassen sich übernehmen oder ablehnen, Kommentare erledigen oder ablehnen.");
  }

  const prozess = db.holeProzess(kommentar.prozess_id);
  const stand = prozess && prozess.aktuell;
  if (!stand) throw new KommentarFehler(404, "Prozess nicht gefunden.");
  const moddle = neuesModdle();
  const { rootElement, elementsById } = await moddle.fromXML(stand.bpmn_xml);
  const bo = elementsById[kommentar.element_id];
  if (!bo || !bo.$instanceOf("bpmn:FlowNode")) {
    throw new KommentarFehler(409, `Den Schritt „${kommentar.element_name || kommentar.element_id}“ gibt es im aktuellen Modell nicht mehr. Bitte von Hand einarbeiten und ablehnen.`);
  }
  const bisher = (bo.documentation || []).map((d) => d.text || "").join("\n\n").trim();
  bo.documentation = [moddle.create("bpmn:Documentation", { text: bisher ? `${bisher}\n\n${endText}` : endText })];
  const { xml } = await moddle.toXML(rootElement, { format: true });
  const gespeichert = db.speichereVersion({
    prozessId: prozess.id,
    name: prozess.name,
    bpmnXml: xml,
    quelltext: stand.quelltext,
    kiModell: stand.ki_modell,
    kiJson: stand.ki_json,
    pruefungJson: stand.pruefung_json,
    notiz: `Vorschlag von ${kommentar.verfasst_von || "unbekannt"} übernommen (${konto}): ${bo.name || bo.id}`.slice(0, 500)
  });
  db.entscheideKommentar(kommentar.id, { status: "uebernommen", text: endText, entschiedenVon: konto, versionUebernommen: gespeichert.version });
  return { kommentar: db.holeKommentar(kommentar.id), version: gespeichert.version };
}
