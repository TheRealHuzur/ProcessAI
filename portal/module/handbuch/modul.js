// Modul Logbuch (ID handbuch): BPMN-Datei(en) und Titel rein, Handbuch als PDF raus. Mehrere Dateien
// werden zu einem Handbuch zusammengeführt (PICTURE exportiert teils je Diagramm eine Datei). Mehr sieht der
// Kunde nicht. Im Hintergrund bleiben jede hochgeladene Datei und jedes erzeugte PDF auf dem Server, dazu
// Kennzahlen je Handbuch (Übungsmaterial zur Verbesserung, mit den Kunden abgesprochen). Dem Kunden wird
// davon nichts angezeigt; auswerten kann nur die Verwaltung (Router verwaltung).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { leseHandbuch, pdfAusGliederung, bestandteile, HandbuchFehler } from "../../../kern/handbuch/index.js";
import { auswertung } from "./auswertung.js";

const MAX_GROESSE = "30mb";
const MAX_DATEIEN = 20;
const MAX_DATEINAME = 150;
const MAX_TITEL = 150;
const MAX_RUECKMELDUNG = 2000;
const ERSTELLT_MIT = "Erstellt mit dem ProzessPilot von Wissen und Werkzeug";
const FUSSHINWEIS = "Wissen und Werkzeug";

// Live seit 24.11.2026: nur noch anhängen
const MIGRATIONEN = [
  `CREATE TABLE hb_uploads (
     id TEXT PRIMARY KEY,
     mandant_id TEXT NOT NULL REFERENCES mandanten(id),
     dateiname TEXT NOT NULL,
     titel TEXT NOT NULL DEFAULT '',
     datei TEXT NOT NULL,
     groesse INTEGER NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('ok', 'fehler')),
     meldung TEXT NOT NULL DEFAULT '',
     hochgeladen TEXT NOT NULL
   );
   CREATE INDEX idx_hb_uploads_mandant ON hb_uploads(mandant_id, hochgeladen);`,
  // Mehrere Dateien je Handbuch: gemeinsame Vorgangs-ID
  `ALTER TABLE hb_uploads ADD COLUMN vorgang TEXT NOT NULL DEFAULT '';
   UPDATE hb_uploads SET vorgang = id WHERE vorgang = '';`,
  // Ein Eintrag je Handbuch (Vorgang) mit abgelegtem PDF und Kennzahlen; Altbestand ohne PDF und Kennzahlen
  `CREATE TABLE hb_handbuecher (
     vorgang TEXT PRIMARY KEY,
     mandant_id TEXT NOT NULL REFERENCES mandanten(id),
     titel TEXT NOT NULL DEFAULT '',
     dateien INTEGER NOT NULL DEFAULT 0,
     upload_groesse INTEGER NOT NULL DEFAULT 0,
     werkzeug TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL CHECK (status IN ('ok', 'fehler')),
     meldung TEXT NOT NULL DEFAULT '',
     pdf TEXT NOT NULL DEFAULT '',
     pdf_groesse INTEGER NOT NULL DEFAULT 0,
     seiten INTEGER,
     kapitel INTEGER,
     schritte INTEGER,
     mit_arbeitshilfe INTEGER,
     mit_angaben INTEGER,
     fehlende_unterdiagramme INTEGER,
     dauer_ms INTEGER,
     erstellt TEXT NOT NULL
   );
   CREATE INDEX idx_hb_handbuecher_mandant ON hb_handbuecher(mandant_id, erstellt);
   INSERT INTO hb_handbuecher (vorgang, mandant_id, titel, dateien, upload_groesse, status, meldung, erstellt)
     SELECT vorgang, mandant_id, MAX(titel), COUNT(*), SUM(groesse), MAX(status), MAX(meldung), MIN(hochgeladen)
     FROM hb_uploads GROUP BY vorgang, mandant_id;`,
  // Auswertung: Prüfsumme je Datei (Wiederholungen), Textlänge der Arbeitshilfen, Bestandteile, Rückmeldung des Kunden
  `ALTER TABLE hb_uploads ADD COLUMN inhalt_hash TEXT NOT NULL DEFAULT '';
   ALTER TABLE hb_handbuecher ADD COLUMN arbeitshilfe_zeichen INTEGER;
   ALTER TABLE hb_handbuecher ADD COLUMN bestandteile TEXT NOT NULL DEFAULT '';
   CREATE TABLE hb_rueckmeldungen (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     vorgang TEXT NOT NULL REFERENCES hb_handbuecher(vorgang),
     mandant_id TEXT NOT NULL REFERENCES mandanten(id),
     passt INTEGER NOT NULL CHECK (passt IN (0, 1)),
     text TEXT NOT NULL DEFAULT '',
     zeit TEXT NOT NULL
   );
   CREATE INDEX idx_hb_rueckmeldungen_vorgang ON hb_rueckmeldungen(vorgang, id);`
];

class EingabeFehler extends Error {}

// Text ohne Steuerzeichen und doppelte Leerzeichen
function bereinigt(wert) {
  return String(wert || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

function dateinameAus(wert) {
  const name = path.basename(bereinigt(wert).replace(/\\/g, "/"));
  if (!name) throw new EingabeFehler("Der Dateiname fehlt.");
  if (name.length > MAX_DATEINAME) throw new EingabeFehler(`Der Dateiname ist zu lang (höchstens ${MAX_DATEINAME} Zeichen).`);
  if (!/\.(bpmn|xml)$/i.test(name)) throw new EingabeFehler("Bitte eine BPMN-Datei hochladen (Endung .bpmn oder .xml).");
  return name;
}

// Ersatztitel, falls der Anwender keinen eingibt: Dateiname ohne Endung, Unterstriche als Leerzeichen
export function titelAusDateiname(dateiname) {
  return dateiname.replace(/\.(bpmn|xml)$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

// Herkunft der Datei laut BPMN-Kopf (exporter), sonst nach Namensraum (ADONIS schreibt keinen exporter)
const NAMENSRAEUME = [[/boc-group\.com/i, "ADONIS"], [/picture-gmbh\.de/i, "PICTURE"], [/camunda\.org/i, "Camunda"],
  [/signavio\.com/i, "Signavio"], [/bizagi\.com/i, "Bizagi"], [/prozesspilot\.wissen-und-werkzeug\.de/i, "ProzessPilot"]];
export function werkzeugAus(xml) {
  const kopf = String(xml || "").slice(0, 4000);
  const name = (kopf.match(/\bexporter\s*=\s*"([^"]*)"/) || [])[1] || "";
  const version = (kopf.match(/\bexporterVersion\s*=\s*"([^"]*)"/) || [])[1] || "";
  if (name) return bereinigt(`${name} ${version}`).slice(0, 80);
  const treffer = NAMENSRAEUME.find(([muster]) => muster.test(kopf));
  return treffer ? treffer[1] : "";
}

// Kennzahlen aus der Gliederung: wie vollständig ist das Wissen am Modell
export function kennzahlen(gliederung) {
  const z = { kapitel: gliederung.kapitel.length, schritte: 0, mit_arbeitshilfe: 0, arbeitshilfe_zeichen: 0, mit_angaben: 0, fehlende_unterdiagramme: 0 };
  const zaehle = (eintraege) => {
    for (const e of eintraege) {
      if (e.art !== "bahn") {
        z.schritte += 1;
        if (e.arbeitshilfe) {
          z.mit_arbeitshilfe += 1;
          z.arbeitshilfe_zeichen += e.arbeitshilfe.length;
        }
        if (Object.values(e.wissen || {}).some((w) => Array.isArray(w) && w.length)) z.mit_angaben += 1;
        if (e.hinweis) z.fehlende_unterdiagramme += 1;
      }
      zaehle(e.eintraege || []);
    }
  };
  for (const k of gliederung.kapitel) zaehle(k.eintraege);
  return z;
}

// Seitenzahl aus dem PDF (pdfmake schreibt die Seitenobjekte unkomprimiert)
export function seitenImPdf(pdf) {
  return (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

function datumHeute() {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

function router({ db, kern, datenDir }) {
  const ablegen = db.prepare(`INSERT INTO hb_uploads (id, vorgang, mandant_id, dateiname, titel, datei, groesse, status, meldung, hochgeladen, inhalt_hash)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const vermerken = db.prepare(`INSERT INTO hb_handbuecher (vorgang, mandant_id, titel, dateien, upload_groesse, werkzeug, status, meldung,
                                  pdf, pdf_groesse, seiten, kapitel, schritte, mit_arbeitshilfe, mit_angaben, fehlende_unterdiagramme, dauer_ms, erstellt,
                                  arbeitshilfe_zeichen, bestandteile)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const ablegenRueckmeldung = db.prepare("INSERT INTO hb_rueckmeldungen (vorgang, mandant_id, passt, text, zeit) VALUES (?, ?, ?, ?, ?)");
  const eigenesHandbuch = db.prepare("SELECT status FROM hb_handbuecher WHERE vorgang = ? AND mandant_id = ?");
  const r = express.Router();

  // Erwartet JSON { titel, dateien: [{ name, inhalt }] }; inhalt ist der Text der BPMN-Datei
  r.post("/erstellen", express.json({ limit: MAX_GROESSE }), async (req, res) => {
    let dateien;
    let titel;
    try {
      const roh = Array.isArray(req.body && req.body.dateien) ? req.body.dateien : [];
      if (!roh.length) throw new EingabeFehler("Bitte mindestens eine BPMN-Datei auswählen.");
      if (roh.length > MAX_DATEIEN) throw new EingabeFehler(`Höchstens ${MAX_DATEIEN} Dateien auf einmal.`);
      dateien = roh.map((d) => {
        const name = dateinameAus(d && d.name);
        const inhalt = String((d && d.inhalt) || "").replace(/^\uFEFF/, "");
        if (!inhalt.trim()) throw new EingabeFehler(`Die Datei „${name}“ ist leer.`);
        return { name, inhalt };
      });
      titel = bereinigt(req.body && req.body.titel).slice(0, MAX_TITEL) || titelAusDateiname(dateien[0].name);
    } catch (error) {
      if (error instanceof EingabeFehler) return res.status(400).json({ fehler: error.message });
      throw error;
    }

    // Erst im Hintergrund ablegen, dann erzeugen: auch Dateien, die nicht klappen, bleiben als Übungsmaterial
    const vorgang = crypto.randomUUID();
    const abgelegt = dateien.map((d) => {
      const id = crypto.randomUUID();
      const relativ = path.join("uploads", req.mandant.id, `${id}.bpmn`);
      try {
        fs.mkdirSync(path.join(datenDir, "uploads", req.mandant.id), { recursive: true });
        fs.writeFileSync(path.join(datenDir, relativ), d.inhalt);
      } catch (error) {
        console.error("Upload nicht abgelegt:", error);
      }
      return { ...d, id, relativ };
    });

    let pdf = null;
    let meldung = "";
    let zahlen = {};
    const start = Date.now();
    try {
      const gliederung = await leseHandbuch(dateien.map((d) => ({ name: d.name, xml: d.inhalt })));
      zahlen = kennzahlen(gliederung);
      pdf = await pdfAusGliederung(gliederung, {
        name: titel,
        stand: datumHeute(),
        organisation: req.mandant.name,
        erstelltMit: ERSTELLT_MIT,
        fusshinweis: FUSSHINWEIS
      });
    } catch (error) {
      meldung = error instanceof HandbuchFehler ? error.message : "Unerwarteter Fehler beim Erstellen des Handbuchs.";
      if (!(error instanceof HandbuchFehler)) console.error("Handbuch fehlgeschlagen:", error);
    }

    const dauer = Date.now() - start;
    const status = pdf ? "ok" : "fehler";
    const zeit = new Date().toISOString();
    // Auch das PDF bleibt im Hintergrund, unter der Vorgangs-ID
    let pdfRelativ = "";
    if (pdf) {
      try {
        fs.mkdirSync(path.join(datenDir, "handbuecher", req.mandant.id), { recursive: true });
        pdfRelativ = path.join("handbuecher", req.mandant.id, `${vorgang}.pdf`);
        fs.writeFileSync(path.join(datenDir, pdfRelativ), Buffer.from(pdf));
      } catch (error) {
        pdfRelativ = "";
        console.error("Handbuch nicht abgelegt:", error);
      }
    }
    const werkzeug = [...new Set(dateien.map((d) => werkzeugAus(d.inhalt)).filter(Boolean))].join(", ").slice(0, 200);
    // Bestandteile auch bei Fehlern: gerade dann ist interessant, was in der Datei steckt
    let teile = "";
    try {
      teile = JSON.stringify(await bestandteile(dateien.map((d) => d.inhalt)));
    } catch (error) {
      console.error("Bestandteile nicht ermittelt:", error);
    }
    try {
      vermerken.run(vorgang, req.mandant.id, titel, dateien.length, dateien.reduce((s, d) => s + Buffer.byteLength(d.inhalt), 0), werkzeug, status, meldung,
        pdfRelativ, pdf ? pdf.length : 0, pdf ? seitenImPdf(pdf) : null, zahlen.kapitel ?? null, zahlen.schritte ?? null, zahlen.mit_arbeitshilfe ?? null,
        zahlen.mit_angaben ?? null, zahlen.fehlende_unterdiagramme ?? null, dauer, zeit, zahlen.arbeitshilfe_zeichen ?? null, teile);
    } catch (error) {
      console.error("Handbuch nicht vermerkt:", error);
    }
    for (const d of abgelegt) {
      try {
        ablegen.run(d.id, vorgang, req.mandant.id, d.name, titel, d.relativ, Buffer.byteLength(d.inhalt), status, meldung, zeit,
          crypto.createHash("sha256").update(d.inhalt).digest("hex"));
      } catch (error) {
        console.error("Upload nicht vermerkt:", error);
      }
    }
    const namen = dateien.map((d) => d.name).join(", ");
    kern.protokolliere({ mandantId: req.mandant.id, modulId: "handbuch", aktion: "handbuch erstellt", ergebnis: status, details: `${namen}${meldung ? `: ${meldung}` : ""}` });

    if (!pdf) return res.status(422).json({ fehler: meldung });
    const datei = `${titel.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Prozess"} Handbuch.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="handbuch.pdf"; filename*=UTF-8''${encodeURIComponent(datei)}`);
    // Für die Rückmeldung „Passt das Handbuch?“ (gleiche Herkunft, kein CORS nötig)
    res.setHeader("X-Vorgang", vorgang);
    return res.send(Buffer.from(pdf));
  });

  // Rückmeldung zum eigenen, erfolgreich erstellten Handbuch: { vorgang, passt, text }. Jede bleibt erhalten, die letzte gilt.
  r.post("/rueckmeldung", express.json({ limit: "20kb" }), (req, res) => {
    const vorgang = String((req.body && req.body.vorgang) || "");
    const h = eigenesHandbuch.get(vorgang, req.mandant.id);
    if (!h || h.status !== "ok") return res.status(404).json({ fehler: "Handbuch nicht gefunden." });
    if (typeof req.body.passt !== "boolean") return res.status(400).json({ fehler: "Bitte Ja oder Nein wählen." });
    const text = String(req.body.text || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, MAX_RUECKMELDUNG);
    ablegenRueckmeldung.run(vorgang, req.mandant.id, req.body.passt ? 1 : 0, text, new Date().toISOString());
    kern.protokolliere({ mandantId: req.mandant.id, modulId: "handbuch", aktion: "rueckmeldung", details: req.body.passt ? "passt" : "passt nicht" });
    return res.json({ ok: true });
  });

  return r;
}

// Nur für die Verwaltung (unter /api/verwaltung/m/handbuch): Liste der Handbücher, Download von PDF und Dateien.
// Pfade kommen immer aus der Datenbank, nie aus der Anfrage.
function verwaltung({ db, datenDir }) {
  const q = {
    liste: db.prepare(`SELECT h.*, m.name AS organisation, COALESCE(m.auswerten, 1) AS auswerten,
                         (SELECT json_group_array(json_object('id', u.id, 'name', u.dateiname)) FROM hb_uploads u WHERE u.vorgang = h.vorgang) AS dateiliste
                       FROM hb_handbuecher h LEFT JOIN mandanten m ON m.id = h.mandant_id
                       ORDER BY h.erstellt DESC LIMIT ?`),
    pdf: db.prepare("SELECT pdf, titel FROM hb_handbuecher WHERE vorgang = ?"),
    datei: db.prepare("SELECT datei, dateiname FROM hb_uploads WHERE id = ?")
  };
  const senden = (res, relativ, name, typ) => {
    const voll = relativ && path.resolve(datenDir, relativ);
    if (!voll || !voll.startsWith(path.resolve(datenDir) + path.sep) || !fs.existsSync(voll)) return res.status(404).json({ fehler: "Datei nicht vorhanden." });
    res.setHeader("Content-Type", typ);
    res.setHeader("Content-Disposition", `attachment; filename="datei"; filename*=UTF-8''${encodeURIComponent(name)}`);
    return res.sendFile(voll);
  };
  const r = express.Router();
  r.get("/handbuecher", (req, res) => {
    const anzahl = Math.min(Math.max(Number(req.query.anzahl) || 100, 1), 1000);
    res.json({ handbuecher: q.liste.all(anzahl).map(({ dateiliste, ...h }) => ({ ...h, dateien_liste: JSON.parse(dateiliste || "[]") })) });
  });
  r.get("/handbuecher/:vorgang/pdf", (req, res) => {
    const h = q.pdf.get(String(req.params.vorgang));
    return senden(res, h && h.pdf, `${(h && h.titel) || "Handbuch"}.pdf`, "application/pdf");
  });
  r.get("/auswertung", (req, res) => {
    res.json(auswertung(db, { zeitraum: req.query.zeitraum, mandant: req.query.mandant ? String(req.query.mandant) : null }));
  });
  r.get("/dateien/:id", (req, res) => {
    const d = q.datei.get(String(req.params.id));
    return senden(res, d && d.datei, (d && d.dateiname) || "datei.bpmn", "application/xml");
  });
  return r;
}

export default {
  id: "handbuch",
  name: "Logbuch",
  beschreibung: "BPMN-Modell hochladen (auch mehrere Dateien), Titel eingeben und ein Handbuch als PDF erstellen.",
  icon: "book",
  knopf: "Handbuch erstellen",
  migrationen: MIGRATIONEN,
  oberflaeche: path.join(path.dirname(fileURLToPath(import.meta.url)), "oberflaeche"),
  router,
  verwaltung
};
