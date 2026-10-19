// MCP-Schnittstelle für Claude Desktop: Prozesse anlegen, lesen, ändern, Arbeitshilfen pflegen.
// Streamable HTTP ohne Sitzung: jede Anfrage ist ein JSON-RPC-Aufruf, die Antwort kommt als JSON.
// Zugang über MCP_TOKEN, Kopfzeile x-api-token (Claude) oder Authorization: Bearer (andere Programme).
// Jede Speicherung ist eine neue Version. Endgültig entfernt nur prozess_loeschen.
import crypto from "node:crypto";
import express from "express";
import { config, findModel, verfuegbareModelle } from "./config.js";
import { erzeugeModell, aendereModell, bauenAusJson, zuXml, vergleicheModelle } from "./pipeline.js";
import { normalisiereModell } from "./modell.js";
import { systemPrompt } from "./prompt.js";
import { LlmError } from "./llm.js";
import { erzeugeHandbuch, HandbuchFehler } from "./handbuch.js";
import { PPWissen } from "./wissen.js";
import { leseModellAusXml, neuesModdle } from "./modell-lesen.js";

const PROTOKOLLE = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const QUELLE = "claude-desktop";
const LINK_GUELTIG_MS = 60 * 60 * 1000;

const ANWEISUNGEN = `ProzessPilot macht aus Prozessbeschreibungen BPMN-2.0-Modelle und hängt Wissen an die Schritte (Arbeitshilfe, Dokumente und Vorlagen, Ansprechpersonen, Rechtsgrundlagen).
Regeln: Rollen statt Personennamen. Nichts erfinden und nichts weglassen; Unklares gehört als Frage in "unklarheiten". Nur die Elemente des Basis-Levels.
Jede Speicherung ist eine neue Version, alte Versionen bleiben erhalten (version_wiederherstellen). Nur prozess_loeschen entfernt einen Prozess endgültig mit allen Versionen.
Zwei Wege zum Modell: prozess_erzeugen und prozess_aendern lassen die KI der App arbeiten. modell_speichern nimmt ein Modell, das du selbst baust; lies dafür vorher anleitung_lesen.
Vor jeder Änderung prozess_lesen. modell_speichern und prozess_aendern ordnen das Diagramm neu an. arbeitshilfen_setzen ändert nur die Angaben an Schritten und lässt die Anordnung stehen.`;

export class WerkzeugFehler extends Error {}

// ---------- Hilfen ----------

function textAus(wert) {
  return typeof wert === "string" ? wert.trim() : wert == null ? "" : String(wert).trim();
}

function liste(wert) {
  return Array.isArray(wert) ? wert.map(textAus).filter(Boolean) : [];
}

function jsonOderNull(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function gleich(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function signatur(prozessId, version, bis) {
  return crypto.createHmac("sha256", config.mcpToken).update(`handbuch.${prozessId}.${version}.${bis}`).digest("base64url");
}

function versionsNummer(wert) {
  if (wert == null || wert === "") return null;
  const n = Number(wert);
  if (!Number.isInteger(n) || n < 1) throw new WerkzeugFehler("version muss eine ganze Zahl ab 1 sein.");
  return n;
}

function ladeStand(db, prozessId, version = null) {
  const prozess = db.holeProzess(textAus(prozessId));
  if (!prozess) throw new WerkzeugFehler(`Prozess "${textAus(prozessId)}" nicht gefunden. prozesse_auflisten zeigt alle Prozesse.`);
  const stand = version ? db.holeVersion(prozess.id, version) : prozess.aktuell;
  if (!stand) throw new WerkzeugFehler(version ? `Version ${version} gibt es nicht.` : "Der Prozess hat keine Version.");
  return { prozess, stand };
}

// Modell aus dem gespeicherten XML; offene Fragen stehen nicht im XML, sondern im gespeicherten KI-JSON
async function modellAusStand(stand) {
  let gelesen;
  try {
    gelesen = await leseModellAusXml(stand.bpmn_xml);
  } catch {
    return { modell: null, abweichungen: ["Das gespeicherte XML ist nicht lesbar."] };
  }
  const ki = jsonOderNull(stand.ki_json);
  if (gelesen.modell && ki) {
    gelesen.modell.unklarheiten = liste(ki.unklarheiten);
    gelesen.modell.nicht_modelliert = liste(ki.nicht_modelliert ?? ki.nichtModelliert);
  }
  return gelesen;
}

function pruefeVerluste(abweichungen, verlusteAkzeptieren) {
  if (abweichungen.length && !verlusteAkzeptieren) {
    throw new WerkzeugFehler(`Beim Neuaufbau gingen Teile des Modells verloren:\n- ${abweichungen.join("\n- ")}\nMit verluste_akzeptieren: true trotzdem ausführen.`);
  }
}

function waehleKiModell(id) {
  const gesucht = textAus(id);
  if (gesucht) {
    const model = findModel(gesucht);
    if (!model) throw new WerkzeugFehler(`KI-Modell "${gesucht}" ist nicht verfügbar. ki_modelle_auflisten zeigt die verfügbaren.`);
    return model;
  }
  return verfuegbareModelle()[0] || config.models[0];
}

function modellAusEingabe(wert) {
  let roh = wert;
  if (typeof roh === "string") {
    try {
      roh = JSON.parse(roh);
    } catch {
      throw new WerkzeugFehler("modell ist kein gültiges JSON.");
    }
  }
  if (!roh || typeof roh !== "object" || !Array.isArray(roh.elemente) || roh.elemente.length === 0) {
    throw new WerkzeugFehler("modell braucht mindestens ein Element in \"elemente\". Das Format steht in anleitung_lesen.");
  }
  return roh;
}

// Fehlt bei einem Element das Feld beschreibung oder wissen, gilt der bisherige Stand (über die id).
// Ein leerer Wert ("" bzw. leere Listen) löscht dagegen bewusst.
function uebernehmeFehlendeAngaben(roh, alt) {
  const altById = new Map(alt.elemente.map((e) => [e.id, e]));
  return {
    ...roh,
    elemente: roh.elemente.map((e) => {
      const vorher = e && altById.get(textAus(e.id));
      if (!vorher) return e;
      return {
        ...(vorher.beschreibung && !("beschreibung" in e) ? { beschreibung: vorher.beschreibung } : {}),
        ...(vorher.wissen && !("wissen" in e) ? { wissen: vorher.wissen } : {}),
        ...e
      };
    })
  };
}

function pruefungAus(ergebnis) {
  return { fehler: [...ergebnis.probleme, ...ergebnis.pruefung.fehler], hinweise: ergebnis.pruefung.hinweise };
}

function aenderungKurz(vergleich) {
  if (!vergleich) return undefined;
  const { neu, geaendert, entfernt, unveraendert } = vergleich;
  return { neu, geaendert, entfernt, unveraendert };
}

// ---------- Werkzeuge ----------

const NUR_LESEN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const SCHREIBEN = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const PROZESS_ID = { type: "string", description: "id des Prozesses aus prozesse_auflisten" };
const VERSION = { type: "integer", minimum: 1, description: "Versionsnummer; ohne Angabe die neueste" };
const NOTIZ = { type: "string", description: "Kurze Notiz zur Version, erscheint in der Versionsliste" };
const VERLUSTE = { type: "boolean", description: "Nur nötig, wenn prozess_lesen Abweichungen meldet (z. B. Inhalt aufgeklappter Teilprozesse, fremde Elemente). true nimmt den Verlust in Kauf." };
const ANGABEN_LISTE = (titel) => ({ type: "array", items: { type: "string" }, description: `${titel}, ein Eintrag je Angabe. Ersetzt die bisherige Liste; [] leert sie.` });

function werkzeuge({ db, llm }) {
  const llmOption = llm ? { llm } : {};

  return [
    {
      name: "anleitung_lesen",
      title: "Anleitung und Regelwerk lesen",
      description: "Liefert das JSON-Format des Prozessmodells, die Arbeitsweise und das vollständige BPMN-Regelwerk. Vor modell_speichern lesen.",
      inputSchema: { type: "object", properties: {} },
      annotations: NUR_LESEN,
      run: async () => `ANLEITUNG FÜR DICH ALS CLAUDE DESKTOP
Unten steht die Anleitung, die auch die KI der App bekommt. Für dich gilt sie mit diesen Abweichungen:
- Du antwortest nicht mit JSON, sondern übergibst das Modell an modell_speichern (Parameter modell).
- "beschreibung" ist die Arbeitshilfe zum Schritt. Fülle sie nur mit dem, was der Mensch dir dazu gesagt oder gegeben hat.
- An Aufgaben und Teilprozessen darf zusätzlich "wissen" stehen: { "dokumente": [], "ansprechpersonen": [], "rechtsgrundlagen": [] }, je eine Angabe pro Eintrag, Ansprechpersonen als Rolle.
- Lässt du beim Speichern eines bestehenden Prozesses "beschreibung" oder "wissen" an einem Element weg, bleibt der bisherige Stand erhalten. Ein leerer Wert löscht.
- Prüfe mit nur_pruefen: true, bis "fehler" leer ist, und speichere dann. Hinweise sind Korrekturen, die die App selbst gemacht hat.
- Für reine Wissenspflege ohne Änderung am Ablauf nimm arbeitshilfen_setzen, dann bleibt die Anordnung im Diagramm stehen.

${systemPrompt()}`
    },
    {
      name: "prozesse_auflisten",
      title: "Prozesse auflisten",
      description: "Alle gespeicherten Prozesse mit id, Name, neuester Versionsnummer und Zeitpunkten, zuletzt geänderte zuerst.",
      inputSchema: { type: "object", properties: {} },
      annotations: NUR_LESEN,
      run: async () => ({ prozesse: db.listeProzesse() })
    },
    {
      name: "prozess_lesen",
      title: "Prozess lesen",
      description: "Ein Prozess in einer Version: Modell als JSON (mit Arbeitshilfen und weiteren Angaben), offene Fragen, aktuelle Regelprüfung, Versionsliste, ursprüngliche Beschreibung. abweichungen nennt, was beim Neuaufbau verloren ginge.",
      inputSchema: {
        type: "object",
        properties: { prozess_id: PROZESS_ID, version: VERSION, mit_xml: { type: "boolean", description: "true liefert zusätzlich das BPMN-XML" } },
        required: ["prozess_id"]
      },
      annotations: NUR_LESEN,
      run: async (args) => {
        const { prozess, stand } = ladeStand(db, args.prozess_id, versionsNummer(args.version));
        const { modell, abweichungen } = await modellAusStand(stand);
        const pruefung = modell ? pruefungAus(bauenAusJson(modell)) : null;
        return {
          prozess_id: prozess.id,
          name: prozess.name,
          version: stand.version,
          neueste_version: prozess.aktuell?.version ?? stand.version,
          gespeichert: stand.erstellt,
          ki_modell: stand.ki_modell,
          notiz: stand.notiz,
          ursprungstext: stand.quelltext,
          modell,
          abweichungen,
          pruefung,
          versionen: prozess.versionen.map(({ version, ki_modell, notiz, erstellt }) => ({ version, ki_modell, notiz, erstellt })),
          ...(args.mit_xml ? { bpmn_xml: stand.bpmn_xml } : {})
        };
      }
    },
    {
      name: "prozess_erzeugen",
      title: "Prozess von der App-KI erzeugen",
      description: "Die KI der App macht aus einer Prozessbeschreibung ein Modell (mit Regelprüfung, Korrekturrunde und Anordnung) und speichert es als neuen Prozess. Kann eine Minute dauern.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: `Prozessbeschreibung in normaler Sprache, 20 bis ${config.maxTextLength} Zeichen` },
          prozessname: { type: "string", description: "Name des Prozesses; ohne Angabe benennt die KI ihn" },
          ki_modell: { type: "string", description: "id aus ki_modelle_auflisten; ohne Angabe das Standardmodell der App" }
        },
        required: ["text"]
      },
      annotations: { ...SCHREIBEN, openWorldHint: true },
      run: async (args) => {
        const text = textAus(args.text);
        const prozessname = textAus(args.prozessname);
        if (text.length < 20) throw new WerkzeugFehler("Die Prozessbeschreibung ist zu kurz.");
        if (text.length > config.maxTextLength) throw new WerkzeugFehler(`Die Prozessbeschreibung ist zu lang (höchstens ${config.maxTextLength} Zeichen).`);
        const model = waehleKiModell(args.ki_modell);
        const beginn = Date.now();
        const ergebnis = await erzeugeModell({ text, prozessname, model, ...llmOption });
        const name = prozessname || ergebnis.prozessname || "Neuer Prozess";
        const gespeichert = db.speichereVersion({
          prozessId: null,
          name,
          bpmnXml: ergebnis.xml,
          quelltext: text,
          kiModell: model.id,
          kiJson: JSON.stringify(ergebnis.modellJson),
          pruefungJson: JSON.stringify(ergebnis.pruefung),
          notiz: "Erzeugt über Claude Desktop"
        });
        return {
          prozess_id: gespeichert.id,
          version: gespeichert.version,
          name,
          ki_modell: model.id,
          dauer_ms: Date.now() - beginn,
          pruefung: ergebnis.pruefung,
          unklarheiten: ergebnis.unklarheiten,
          nicht_modelliert: ergebnis.nichtModelliert,
          korrigiert: ergebnis.korrigiert
        };
      }
    },
    {
      name: "prozess_aendern",
      title: "Prozess von der App-KI ändern",
      description: "Die KI der App setzt eine Änderungsanweisung am neuesten Stand um (Regelprüfung und Anordnung wie beim Erzeugen) und speichert eine neue Version. Arbeitshilfen und weitere Angaben bleiben erhalten. Mit frage beantwortest du eine offene Frage aus unklarheiten. Fragt die KI zurück, wird nichts gespeichert.",
      inputSchema: {
        type: "object",
        properties: {
          prozess_id: PROZESS_ID,
          anweisung: { type: "string", description: "Was sich ändern soll, 3 bis 2000 Zeichen; bei frage die Antwort darauf" },
          element_id: { type: "string", description: "Bezug auf ein Element; \"das\" oder \"dieser Schritt\" in der Anweisung meinen dann dieses" },
          frage: { type: "string", description: "Die offene Frage aus unklarheiten, die anweisung beantwortet" },
          ki_modell: { type: "string", description: "id aus ki_modelle_auflisten; ohne Angabe das Standardmodell der App" },
          verluste_akzeptieren: VERLUSTE
        },
        required: ["prozess_id", "anweisung"]
      },
      annotations: { ...SCHREIBEN, openWorldHint: true },
      run: async (args) => {
        const anweisung = textAus(args.anweisung);
        if (anweisung.length < 3) throw new WerkzeugFehler("Bitte sag, was sich ändern soll.");
        if (anweisung.length > 2000) throw new WerkzeugFehler("Die Anweisung ist zu lang (höchstens 2000 Zeichen).");
        const { prozess, stand } = ladeStand(db, args.prozess_id);
        const { modell, abweichungen } = await modellAusStand(stand);
        if (!modell || modell.elemente.length === 0) throw new WerkzeugFehler("Der Prozess hat kein Modell, das geändert werden kann.");
        pruefeVerluste(abweichungen, args.verluste_akzeptieren);
        const elementId = textAus(args.element_id);
        const element = elementId ? modell.elemente.find((e) => e.id === elementId) : null;
        if (elementId && !element) throw new WerkzeugFehler(`Element "${elementId}" gibt es im Modell nicht.`);
        const bezug = { elementId, elementName: element?.name || "", frage: textAus(args.frage) };
        const model = waehleKiModell(args.ki_modell);
        const ergebnis = await aendereModell({ modellJson: modell, anweisung, bezug, model, ...llmOption });
        const { texte, rueckfrage } = ergebnis.aenderung;
        const antwort = { aenderungen: texte, rueckfrage, aenderung: aenderungKurz(ergebnis.aenderung), pruefung: ergebnis.pruefung, unklarheiten: ergebnis.unklarheiten };
        if (ergebnis.aenderung.unveraendert) {
          return { gespeichert: false, prozess_id: prozess.id, version: stand.version, ...antwort };
        }
        const gespeichert = db.speichereVersion({
          prozessId: prozess.id,
          name: prozess.name,
          bpmnXml: ergebnis.xml,
          quelltext: stand.quelltext,
          kiModell: model.id,
          kiJson: JSON.stringify(ergebnis.modellJson),
          pruefungJson: JSON.stringify(ergebnis.pruefung),
          notiz: `Über Claude Desktop geändert: ${anweisung}`.slice(0, 500)
        });
        return { gespeichert: true, prozess_id: gespeichert.id, version: gespeichert.version, ...antwort };
      }
    },
    {
      name: "modell_speichern",
      title: "Eigenes Modell prüfen und speichern",
      description: "Nimmt ein Prozessmodell als JSON (Format in anleitung_lesen), prüft es gegen das Regelwerk, ordnet es an und speichert es: ohne prozess_id als neuen Prozess, mit prozess_id als neue Version. nur_pruefen: true prüft nur. Fehlende beschreibung oder wissen an bestehenden Elementen werden übernommen.",
      inputSchema: {
        type: "object",
        properties: {
          modell: { type: "object", description: "Prozessmodell mit prozessname, pool, rollen, externe, elemente, fluesse, nachrichten, daten, unklarheiten, nicht_modelliert", additionalProperties: true },
          prozess_id: { type: "string", description: "Bestehender Prozess; ohne Angabe wird ein neuer angelegt" },
          name: { type: "string", description: "Name des Prozesses in der Liste; ohne Angabe bleibt der bisherige bzw. gilt prozessname" },
          notiz: NOTIZ,
          nur_pruefen: { type: "boolean", description: "true: nur prüfen und Unterschiede zeigen, nichts speichern" },
          verluste_akzeptieren: VERLUSTE
        },
        required: ["modell"]
      },
      annotations: SCHREIBEN,
      run: async (args) => {
        let roh = modellAusEingabe(args.modell);
        let vorher = null;
        if (textAus(args.prozess_id)) {
          vorher = ladeStand(db, args.prozess_id);
          const { modell: alt, abweichungen } = await modellAusStand(vorher.stand);
          if (alt) {
            if (!args.nur_pruefen) pruefeVerluste(abweichungen, args.verluste_akzeptieren);
            roh = uebernehmeFehlendeAngaben(roh, alt);
            vorher.modell = normalisiereModell(alt).modell;
          }
        }
        const ergebnis = bauenAusJson(roh);
        if (ergebnis.modell.elemente.length === 0) throw new WerkzeugFehler("Kein Element des Modells ist gültig.");
        const pruefung = pruefungAus(ergebnis);
        const aenderung = aenderungKurz(vorher?.modell ? vergleicheModelle(vorher.modell, ergebnis.modell) : null);
        if (args.nur_pruefen) return { gespeichert: false, pruefung, aenderung };

        const gespeichert = db.speichereVersion({
          prozessId: vorher?.prozess.id || null,
          name: textAus(args.name) || vorher?.prozess.name || ergebnis.modell.prozessname,
          bpmnXml: zuXml(ergebnis.modell),
          quelltext: vorher?.stand.quelltext || "",
          kiModell: QUELLE,
          kiJson: JSON.stringify(roh),
          pruefungJson: JSON.stringify(pruefung),
          notiz: textAus(args.notiz) || "Modell über Claude Desktop gespeichert"
        });
        return { gespeichert: true, prozess_id: gespeichert.id, version: gespeichert.version, pruefung, aenderung };
      }
    },
    {
      name: "arbeitshilfen_setzen",
      title: "Arbeitshilfen und Angaben an Schritten setzen",
      description: "Setzt an einzelnen Elementen die Arbeitshilfe und an Aufgaben und Teilprozessen die weiteren Angaben, direkt im gespeicherten Modell, ohne KI und ohne neue Anordnung. Nur übergebene Felder ändern sich. Alle Einträge zusammen ergeben eine neue Version.",
      inputSchema: {
        type: "object",
        properties: {
          prozess_id: PROZESS_ID,
          eintraege: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                element_id: { type: "string", description: "id des Elements aus prozess_lesen (auch innerhalb aufgeklappter Teilprozesse)" },
                arbeitshilfe: { type: "string", description: "Text der Arbeitshilfe (BPMN-Feld documentation); \"\" löscht sie" },
                dokumente: ANGABEN_LISTE("Dokumente und Vorlagen"),
                ansprechpersonen: ANGABEN_LISTE("Ansprechpersonen als Rolle"),
                rechtsgrundlagen: ANGABEN_LISTE("Rechtsgrundlagen")
              },
              required: ["element_id"]
            }
          },
          notiz: NOTIZ
        },
        required: ["prozess_id", "eintraege"]
      },
      annotations: SCHREIBEN,
      run: async (args) => {
        const eintraege = Array.isArray(args.eintraege) ? args.eintraege : [];
        if (eintraege.length === 0) throw new WerkzeugFehler("eintraege ist leer.");
        const { prozess, stand } = ladeStand(db, args.prozess_id);
        const moddle = neuesModdle();
        const { rootElement, elementsById } = await moddle.fromXML(stand.bpmn_xml);
        const geaendert = [];
        for (const eintrag of eintraege) {
          const id = textAus(eintrag?.element_id);
          const bo = elementsById[id];
          if (!bo || !bo.$instanceOf("bpmn:FlowNode")) throw new WerkzeugFehler(`Element "${id}" gibt es im Modell nicht (oder es ist kein Schritt, Ereignis oder Gateway). Nichts wurde gespeichert.`);
          if ("arbeitshilfe" in eintrag) {
            const text = textAus(eintrag.arbeitshilfe);
            bo.documentation = text ? [moddle.create("bpmn:Documentation", { text })] : [];
          }
          const felder = PPWissen.FELDER.filter((f) => f.key in eintrag);
          if (felder.length) {
            if (!bo.$instanceOf("bpmn:Activity")) throw new WerkzeugFehler(`"${bo.name || id}" ist keine Aufgabe und kein Teilprozess; weitere Angaben gibt es nur dort. Nichts wurde gespeichert.`);
            const wissen = PPWissen.lesen(bo);
            for (const f of felder) {
              const wert = eintrag[f.key];
              wissen[f.key] = Array.isArray(wert) ? liste(wert) : PPWissen.zeilen(wert);
            }
            bo.extensionElements = PPWissen.alsExtensionElements(moddle, bo, wissen);
          }
          geaendert.push({ element_id: id, name: bo.name || "" });
        }
        const { xml } = await moddle.toXML(rootElement, { format: true });
        const gespeichert = db.speichereVersion({
          prozessId: prozess.id,
          name: prozess.name,
          bpmnXml: xml,
          quelltext: stand.quelltext,
          kiModell: stand.ki_modell,
          kiJson: stand.ki_json,
          pruefungJson: stand.pruefung_json,
          notiz: textAus(args.notiz) || `Angaben über Claude Desktop: ${geaendert.map((g) => g.name || g.element_id).join(", ")}`.slice(0, 500)
        });
        return { prozess_id: gespeichert.id, version: gespeichert.version, geaendert };
      }
    },
    {
      name: "bpmn_xml_speichern",
      title: "BPMN-XML speichern",
      description: "Speichert ein BPMN-2.0-XML unverändert, etwa aus einem anderen Werkzeug oder von Hand bearbeitet: ohne prozess_id als neuen Prozess, sonst als neue Version. Meldet, was nicht zum Basis-Level gehört.",
      inputSchema: {
        type: "object",
        properties: { bpmn_xml: { type: "string", description: "Vollständiges BPMN-2.0-XML" }, prozess_id: { type: "string", description: "Bestehender Prozess; ohne Angabe ein neuer" }, name: { type: "string" }, notiz: NOTIZ },
        required: ["bpmn_xml"]
      },
      annotations: SCHREIBEN,
      run: async (args) => {
        const bpmnXml = String(args.bpmn_xml || "");
        let gelesen;
        try {
          gelesen = await leseModellAusXml(bpmnXml);
        } catch {
          throw new WerkzeugFehler("bpmn_xml ist kein gültiges BPMN-XML.");
        }
        if (!gelesen.modell) throw new WerkzeugFehler("Im XML ist kein Prozess enthalten.");
        const vorher = textAus(args.prozess_id) ? ladeStand(db, args.prozess_id) : null;
        const gespeichert = db.speichereVersion({
          prozessId: vorher?.prozess.id || null,
          name: textAus(args.name) || vorher?.prozess.name || gelesen.modell.prozessname || "Neuer Prozess",
          bpmnXml,
          quelltext: vorher?.stand.quelltext || "",
          notiz: textAus(args.notiz) || "XML über Claude Desktop gespeichert"
        });
        return { prozess_id: gespeichert.id, version: gespeichert.version, abweichungen: gelesen.abweichungen };
      }
    },
    {
      name: "version_wiederherstellen",
      title: "Ältere Version wiederherstellen",
      description: "Speichert den Stand einer älteren Version als neue, neueste Version. Nichts geht verloren.",
      inputSchema: { type: "object", properties: { prozess_id: PROZESS_ID, version: { ...VERSION, description: "Versionsnummer, die wiederhergestellt wird" } }, required: ["prozess_id", "version"] },
      annotations: SCHREIBEN,
      run: async (args) => {
        const version = versionsNummer(args.version);
        if (!version) throw new WerkzeugFehler("Bitte die Versionsnummer angeben.");
        const { prozess, stand } = ladeStand(db, args.prozess_id, version);
        const gespeichert = db.speichereVersion({
          prozessId: prozess.id,
          name: prozess.name,
          bpmnXml: stand.bpmn_xml,
          quelltext: stand.quelltext,
          kiModell: stand.ki_modell,
          kiJson: stand.ki_json,
          pruefungJson: stand.pruefung_json,
          notiz: `Version ${version} wiederhergestellt über Claude Desktop`
        });
        return { prozess_id: gespeichert.id, version: gespeichert.version, wiederhergestellt: version };
      }
    },
    {
      name: "prozess_loeschen",
      title: "Prozess endgültig löschen",
      description: "Löscht einen Prozess mit allen Versionen endgültig. Lässt sich nicht rückgängig machen. Nur auf ausdrücklichen Wunsch verwenden.",
      inputSchema: { type: "object", properties: { prozess_id: PROZESS_ID }, required: ["prozess_id"] },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      run: async (args) => {
        const { prozess } = ladeStand(db, args.prozess_id);
        db.loescheProzess(prozess.id);
        return { geloescht: true, prozess_id: prozess.id, name: prozess.name, versionen: prozess.versionen.length };
      }
    },
    {
      name: "handbuch_link",
      title: "Handbuch als PDF",
      description: "Erzeugt einen Link auf das Handbuch eines Prozesses als PDF (Deckblatt, Inhaltsverzeichnis, Kapitel je Schwimmbahn mit Arbeitshilfen und Angaben). Der Link gilt eine Stunde und braucht keine Anmeldung; gib ihn dem Menschen weiter.",
      inputSchema: { type: "object", properties: { prozess_id: PROZESS_ID, version: VERSION }, required: ["prozess_id"] },
      annotations: NUR_LESEN,
      run: async (args, { basisUrl }) => {
        const { prozess, stand } = ladeStand(db, args.prozess_id, versionsNummer(args.version));
        const bis = Date.now() + LINK_GUELTIG_MS;
        const link = `${basisUrl}/api/mcp/handbuch/${encodeURIComponent(prozess.id)}/${stand.version}?bis=${bis}&sig=${signatur(prozess.id, stand.version, bis)}`;
        return { link, name: prozess.name, version: stand.version, gueltig_bis: new Date(bis).toISOString() };
      }
    },
    {
      name: "ki_modelle_auflisten",
      title: "KI-Modelle der App",
      description: "KI-Modelle, mit denen prozess_erzeugen und prozess_aendern arbeiten können. Das erste ist der Standard.",
      inputSchema: { type: "object", properties: {} },
      annotations: NUR_LESEN,
      run: async () => ({ modelle: verfuegbareModelle().map(({ id, label }) => ({ id, label })) })
    }
  ];
}

// ---------- Protokoll ----------

function antwort(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function fehler(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function rufeWerkzeug(werkzeug, args, kontext) {
  try {
    const ergebnis = await werkzeug.run(args || {}, kontext);
    const text = typeof ergebnis === "string" ? ergebnis : JSON.stringify(ergebnis, null, 2);
    return { content: [{ type: "text", text }], isError: false };
  } catch (error) {
    const bekannt = error instanceof WerkzeugFehler || error instanceof LlmError;
    if (!bekannt) console.error(`MCP-Werkzeug ${werkzeug.name} fehlgeschlagen:`, error);
    return { content: [{ type: "text", text: bekannt ? error.message : `Unerwarteter Fehler: ${error.message}` }], isError: true };
  }
}

async function bearbeite(nachricht, { liste, kontext }) {
  if (!nachricht || nachricht.jsonrpc !== "2.0" || typeof nachricht.method !== "string") {
    // Antworten des Clients auf Anfragen, die dieser Server nie stellt
    if (nachricht && nachricht.jsonrpc === "2.0" && ("result" in nachricht || "error" in nachricht)) return null;
    return fehler(nachricht?.id, -32600, "Ungültige Anfrage.");
  }
  if (!("id" in nachricht)) return null;
  const { id, method, params = {} } = nachricht;

  switch (method) {
    case "initialize":
      return antwort(id, {
        protocolVersion: PROTOKOLLE.includes(params.protocolVersion) ? params.protocolVersion : PROTOKOLLE[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "prozesspilot", title: "ProzessPilot", version: "0.1.0" },
        instructions: ANWEISUNGEN
      });
    case "ping":
      return antwort(id, {});
    case "tools/list":
      return antwort(id, { tools: liste.map(({ run, ...beschreibung }) => beschreibung) });
    case "tools/call": {
      const werkzeug = liste.find((w) => w.name === params.name);
      if (!werkzeug) return fehler(id, -32602, `Unbekanntes Werkzeug "${params.name}".`);
      return antwort(id, await rufeWerkzeug(werkzeug, params.arguments, kontext));
    }
    default:
      return fehler(id, -32601, `Unbekannte Methode "${method}".`);
  }
}

function tokenAus(req) {
  const kopf = req.get("x-api-token");
  if (kopf) return kopf.trim();
  const auth = req.get("authorization") || "";
  return /^bearer /i.test(auth) ? auth.slice(7).trim() : "";
}

async function mitZugang(req, res, next) {
  if (!config.mcpToken) return res.status(503).json(fehler(null, -32000, "Die MCP-Schnittstelle ist nicht eingerichtet (MCP_TOKEN fehlt)."));
  const token = tokenAus(req);
  if (!token || !gleich(token, config.mcpToken)) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return res.status(401).json(fehler(null, -32001, "Zugang verweigert: Token fehlt oder stimmt nicht."));
  }
  return next();
}

export function mcpRouter({ db, llm }) {
  const router = express.Router();
  const liste = werkzeuge({ db, llm });

  // Handbuch über einen signierten Link aus handbuch_link, ohne Anmeldung
  router.get("/handbuch/:id/:version", async (req, res) => {
    const { id } = req.params;
    const version = Number(req.params.version);
    const bis = Number(req.query.bis);
    const sig = String(req.query.sig || "");
    if (!config.mcpToken || !Number.isInteger(version) || !(bis > Date.now()) || !gleich(sig, signatur(id, version, bis))) {
      return res.status(403).type("text/plain; charset=utf-8").send("Der Link ist abgelaufen oder ungültig. Bitte in Claude einen neuen anfordern.");
    }
    const prozess = db.holeProzess(id);
    const stand = prozess && db.holeVersion(id, version);
    if (!stand) return res.status(404).type("text/plain; charset=utf-8").send("Prozess oder Version nicht gefunden.");
    try {
      const pdf = await erzeugeHandbuch(stand.bpmn_xml, { name: prozess.name, version });
      const datei = `${prozess.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Handbuch"} V${version}.pdf`;
      res.setHeader("Content-Disposition", `inline; filename="handbuch.pdf"; filename*=UTF-8''${encodeURIComponent(datei)}`);
      return res.type("application/pdf").send(Buffer.from(pdf));
    } catch (error) {
      if (error instanceof HandbuchFehler) return res.status(400).type("text/plain; charset=utf-8").send(error.message);
      console.error("Handbuch über MCP fehlgeschlagen:", error);
      return res.status(500).type("text/plain; charset=utf-8").send("Unerwarteter Fehler beim Erstellen des Handbuchs.");
    }
  });

  router.post("/", mitZugang, async (req, res) => {
    const kontext = { basisUrl: `${req.protocol}://${req.get("host")}` };
    const stapel = Array.isArray(req.body);
    const nachrichten = stapel ? req.body : [req.body];
    if (nachrichten.length === 0) return res.status(400).json(fehler(null, -32600, "Leere Anfrage."));
    const antworten = [];
    for (const nachricht of nachrichten) {
      const ergebnis = await bearbeite(nachricht, { liste, kontext });
      if (ergebnis) antworten.push(ergebnis);
    }
    if (antworten.length === 0) return res.status(202).end();
    return res.json(stapel ? antworten : antworten[0]);
  });

  // Kein Ereignisstrom und keine Sitzungen
  router.all("/", (req, res) => res.status(405).set("Allow", "POST").json(fehler(null, -32000, "Nur POST.")));

  router.use((error, req, res, next) => {
    if (error?.type === "entity.parse.failed") return res.status(400).json(fehler(null, -32700, "Die Anfrage ist kein gültiges JSON."));
    return next(error);
  });

  return router;
}
