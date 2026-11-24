// Modul Logbuch (ID handbuch): BPMN-Datei(en) und Titel rein, Handbuch als PDF raus. Mehrere Dateien
// werden zu einem Handbuch zusammengeführt (PICTURE exportiert teils je Diagramm eine Datei). Mehr sieht der
// Kunde nicht. Im Hintergrund bleibt jede hochgeladene Datei auf dem Server (Übungsmaterial zur
// Verbesserung, mit den Kunden abgesprochen); angezeigt oder wiederverwendet wird davon nichts.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { erzeugeHandbuch, HandbuchFehler } from "../../../kern/handbuch/index.js";

const MAX_GROESSE = "30mb";
const MAX_DATEIEN = 20;
const MAX_DATEINAME = 150;
const MAX_TITEL = 150;
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
   UPDATE hb_uploads SET vorgang = id WHERE vorgang = '';`
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

function datumHeute() {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

function router({ db, kern, datenDir }) {
  const ablegen = db.prepare(`INSERT INTO hb_uploads (id, vorgang, mandant_id, dateiname, titel, datei, groesse, status, meldung, hochgeladen)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
    try {
      pdf = await erzeugeHandbuch(dateien.map((d) => ({ name: d.name, xml: d.inhalt })), {
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

    const status = pdf ? "ok" : "fehler";
    const zeit = new Date().toISOString();
    for (const d of abgelegt) {
      try {
        ablegen.run(d.id, vorgang, req.mandant.id, d.name, titel, d.relativ, Buffer.byteLength(d.inhalt), status, meldung, zeit);
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
    return res.send(Buffer.from(pdf));
  });

  return r;
}

export default {
  id: "handbuch",
  name: "Logbuch",
  beschreibung: "BPMN-Modell hochladen (auch mehrere Dateien), Titel eingeben und ein Handbuch als PDF erstellen.",
  migrationen: MIGRATIONEN,
  oberflaeche: path.join(path.dirname(fileURLToPath(import.meta.url)), "oberflaeche"),
  router
};
