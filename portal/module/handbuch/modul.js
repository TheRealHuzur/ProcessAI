// Modul Handbuch-Generator: BPMN-Datei hochladen, Handbuch als PDF herunterladen.
// Jede hochgeladene Datei bleibt auf dem Server (Testmaterial). Für den Mandanten gilt je
// Dateiname nur die neueste: Ein neuer Upload mit demselben Namen ersetzt den alten.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { leseHandbuch, erzeugeHandbuch, HandbuchFehler } from "../../../kern/handbuch/index.js";

const MAX_GROESSE = "20mb";
const MAX_DATEINAME = 150;
const ERSTELLT_MIT = "Erstellt mit dem Handbuch-Generator von Wissen und Werkzeug";
const FUSSHINWEIS = "Wissen und Werkzeug";

const MIGRATIONEN = [
  `CREATE TABLE hb_uploads (
     id TEXT PRIMARY KEY,
     mandant_id TEXT NOT NULL REFERENCES mandanten(id),
     dateiname TEXT NOT NULL,
     schluessel TEXT NOT NULL,
     version INTEGER NOT NULL,
     aktuell INTEGER NOT NULL DEFAULT 1,
     datei TEXT NOT NULL,
     groesse INTEGER NOT NULL,
     titel TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL CHECK (status IN ('ok', 'fehler')),
     meldung TEXT NOT NULL DEFAULT '',
     hochgeladen TEXT NOT NULL
   );
   CREATE INDEX idx_hb_uploads_mandant ON hb_uploads(mandant_id, aktuell, schluessel);`
];

class UploadFehler extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Dateiname aus der Kopfzeile (URL-kodiert), ohne Pfad und Steuerzeichen
function dateinameAus(wert) {
  let name = "";
  try {
    name = decodeURIComponent(String(wert || ""));
  } catch {
    name = "";
  }
  name = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!name) throw new UploadFehler("Der Dateiname fehlt.");
  if (name.length > MAX_DATEINAME) throw new UploadFehler(`Der Dateiname ist zu lang (höchstens ${MAX_DATEINAME} Zeichen).`);
  if (!/\.(bpmn|xml)$/i.test(name)) throw new UploadFehler("Bitte eine BPMN-Datei hochladen (Endung .bpmn oder .xml).");
  return name;
}

// Titel des Handbuchs: Dateiname ohne Endung, Unterstriche als Leerzeichen
export function titelAusDateiname(dateiname) {
  return dateiname.replace(/\.(bpmn|xml)$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

function datumBerlin(iso) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

const oeffentlich = (u) => ({
  id: u.id,
  dateiname: u.dateiname,
  version: u.version,
  titel: u.titel,
  status: u.status,
  meldung: u.meldung,
  groesse: u.groesse,
  hochgeladen: u.hochgeladen
});

function router({ db, kern, datenDir }) {
  const q = {
    aktuelle: db.prepare("SELECT * FROM hb_uploads WHERE mandant_id = ? AND aktuell = 1 ORDER BY dateiname COLLATE NOCASE"),
    eins: db.prepare("SELECT * FROM hb_uploads WHERE id = ? AND mandant_id = ?"),
    letzteVersion: db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM hb_uploads WHERE mandant_id = ? AND schluessel = ?"),
    ablegen: db.prepare("UPDATE hb_uploads SET aktuell = 0 WHERE mandant_id = ? AND schluessel = ?"),
    neu: db.prepare(`INSERT INTO hb_uploads (id, mandant_id, dateiname, schluessel, version, aktuell, datei, groesse, titel, status, meldung, hochgeladen)
                     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`)
  };
  const r = express.Router();
  const protokoll = (req, aktion, ergebnis, details) => kern.protokolliere({ mandantId: req.mandant.id, modulId: "handbuch", aktion, ergebnis, details });

  r.get("/uploads", (req, res) => {
    res.json({ uploads: q.aktuelle.all(req.mandant.id).map(oeffentlich) });
  });

  r.post("/uploads", express.raw({ type: () => true, limit: MAX_GROESSE }), async (req, res) => {
    try {
      const dateiname = dateinameAus(req.get("x-dateiname"));
      const inhalt = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!inhalt.length) throw new UploadFehler("Die Datei ist leer.");

      // Erst ablegen, dann prüfen: auch fehlerhafte Dateien bleiben als Testmaterial erhalten
      const id = crypto.randomUUID();
      const relativ = path.join("uploads", req.mandant.id, `${id}.bpmn`);
      fs.mkdirSync(path.join(datenDir, "uploads", req.mandant.id), { recursive: true });
      fs.writeFileSync(path.join(datenDir, relativ), inhalt);

      let status = "ok";
      let meldung = "";
      let titel = titelAusDateiname(dateiname);
      try {
        const handbuch = await leseHandbuch(inhalt.toString("utf8").replace(/^﻿/, ""));
        if (!titel) titel = handbuch.titel;
      } catch (error) {
        status = "fehler";
        meldung = error instanceof HandbuchFehler ? error.message : "Die Datei konnte nicht gelesen werden.";
        if (!(error instanceof HandbuchFehler)) console.error("Handbuch-Upload nicht lesbar:", error);
      }

      const schluessel = dateiname.toLocaleLowerCase("de-DE");
      db.exec("BEGIN");
      try {
        const version = q.letzteVersion.get(req.mandant.id, schluessel).v + 1;
        q.ablegen.run(req.mandant.id, schluessel);
        q.neu.run(id, req.mandant.id, dateiname, schluessel, version, relativ, inhalt.length, titel, status, meldung, new Date().toISOString());
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      protokoll(req, "hochgeladen", status, `${dateiname}${meldung ? `: ${meldung}` : ""}`);
      return res.status(201).json({ upload: oeffentlich(q.eins.get(id, req.mandant.id)) });
    } catch (error) {
      if (error instanceof UploadFehler) return res.status(error.status).json({ fehler: error.message });
      console.error("Upload fehlgeschlagen:", error);
      return res.status(500).json({ fehler: "Unerwarteter Fehler beim Hochladen." });
    }
  });

  r.get("/uploads/:id/handbuch.pdf", async (req, res) => {
    const u = q.eins.get(String(req.params.id), req.mandant.id);
    if (!u) return res.status(404).json({ fehler: "Datei nicht gefunden." });
    try {
      const xml = fs.readFileSync(path.join(datenDir, u.datei), "utf8").replace(/^﻿/, "");
      const pdf = await erzeugeHandbuch(xml, {
        name: u.titel,
        version: u.version,
        stand: datumBerlin(u.hochgeladen),
        organisation: req.mandant.name,
        erstelltMit: ERSTELLT_MIT,
        fusshinweis: FUSSHINWEIS
      });
      protokoll(req, "handbuch erstellt", "ok", u.dateiname);
      const datei = `${u.titel.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Prozess"} Handbuch.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="handbuch.pdf"; filename*=UTF-8''${encodeURIComponent(datei)}`);
      return res.send(Buffer.from(pdf));
    } catch (error) {
      const meldung = error instanceof HandbuchFehler ? error.message : "Unerwarteter Fehler beim Erstellen des Handbuchs.";
      if (!(error instanceof HandbuchFehler)) console.error("Handbuch fehlgeschlagen:", error);
      protokoll(req, "handbuch erstellt", "fehler", `${u.dateiname}: ${meldung}`);
      return res.status(error instanceof HandbuchFehler ? 422 : 500).json({ fehler: meldung });
    }
  });

  return r;
}

export default {
  id: "handbuch",
  name: "Handbuch-Generator",
  beschreibung: "BPMN-Modelle aus ADONIS, PICTURE oder anderen Werkzeugen hochladen und als Handbuch (PDF) herunterladen.",
  migrationen: MIGRATIONEN,
  oberflaeche: path.join(path.dirname(fileURLToPath(import.meta.url)), "oberflaeche"),
  router
};
