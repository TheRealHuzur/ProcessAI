// SQLite-Datenbank (in Node eingebaut). Schema-Versionen über PRAGMA user_version.
// Weitere Tabellen für Version 2 und 3 siehe docs/datenmodell.md.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const MIGRATIONEN = [
  `CREATE TABLE prozesse (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     erstellt TEXT NOT NULL,
     geaendert TEXT NOT NULL
   );
   CREATE TABLE prozess_versionen (
     id TEXT PRIMARY KEY,
     prozess_id TEXT NOT NULL REFERENCES prozesse(id) ON DELETE CASCADE,
     version INTEGER NOT NULL,
     bpmn_xml TEXT NOT NULL,
     quelltext TEXT NOT NULL DEFAULT '',
     ki_modell TEXT NOT NULL DEFAULT '',
     ki_json TEXT NOT NULL DEFAULT '',
     pruefung_json TEXT NOT NULL DEFAULT '',
     notiz TEXT NOT NULL DEFAULT '',
     erstellt TEXT NOT NULL,
     UNIQUE (prozess_id, version)
   );
   CREATE INDEX idx_versionen_prozess ON prozess_versionen(prozess_id, version DESC);`,
  // Kommentare und Ergänzungsvorschläge am Schritt (Phase 8). element_name hält den Namen zum Zeitpunkt des Eintrags fest.
  `CREATE TABLE kommentare (
     id TEXT PRIMARY KEY,
     prozess_id TEXT NOT NULL REFERENCES prozesse(id) ON DELETE CASCADE,
     element_id TEXT NOT NULL,
     element_name TEXT NOT NULL DEFAULT '',
     art TEXT NOT NULL CHECK (art IN ('kommentar', 'vorschlag')),
     text TEXT NOT NULL,
     verfasst_von TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'uebernommen', 'erledigt', 'abgelehnt')),
     entschieden_von TEXT NOT NULL DEFAULT '',
     entschieden TEXT,
     version_uebernommen INTEGER,
     erstellt TEXT NOT NULL
   );
   CREATE INDEX idx_kommentare_prozess ON kommentare(prozess_id, element_id);
   CREATE INDEX idx_kommentare_status ON kommentare(status, erstellt);`,
  // Arbeitsbereiche: jeder Prozess gehört zu genau einem; vorhandene Prozesse landen in "Allgemein".
  `CREATE TABLE arbeitsbereiche (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL COLLATE NOCASE UNIQUE,
     erstellt TEXT NOT NULL
   );
   INSERT INTO arbeitsbereiche (id, name, erstellt) VALUES ('allgemein', 'Allgemein', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
   ALTER TABLE prozesse ADD COLUMN arbeitsbereich_id TEXT REFERENCES arbeitsbereiche(id);
   UPDATE prozesse SET arbeitsbereich_id = 'allgemein';
   CREATE INDEX idx_prozesse_bereich ON prozesse(arbeitsbereich_id, geaendert DESC);`
];

// Arbeitsbereich für neue Prozesse ohne Angabe
export const STANDARD_BEREICH = "allgemein";

export function oeffneDatenbank(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "prozesspilot.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  const stand = db.prepare("PRAGMA user_version").get().user_version;
  for (let i = stand; i < MIGRATIONEN.length; i += 1) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONEN[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return createRepository(db);
}

function jetzt() {
  return new Date().toISOString();
}

function createRepository(db) {
  const stmts = {
    liste: db.prepare(`
      SELECT p.id, p.name, p.erstellt, p.geaendert, p.arbeitsbereich_id, a.name AS arbeitsbereich,
             (SELECT MAX(version) FROM prozess_versionen v WHERE v.prozess_id = p.id) AS version
      FROM prozesse p LEFT JOIN arbeitsbereiche a ON a.id = p.arbeitsbereich_id ORDER BY p.geaendert DESC`),
    listeBereich: db.prepare(`
      SELECT p.id, p.name, p.erstellt, p.geaendert, p.arbeitsbereich_id, a.name AS arbeitsbereich,
             (SELECT MAX(version) FROM prozess_versionen v WHERE v.prozess_id = p.id) AS version
      FROM prozesse p LEFT JOIN arbeitsbereiche a ON a.id = p.arbeitsbereich_id
      WHERE p.arbeitsbereich_id = ? ORDER BY p.geaendert DESC`),
    bereiche: db.prepare(`
      SELECT a.id, a.name, a.erstellt, (SELECT COUNT(*) FROM prozesse p WHERE p.arbeitsbereich_id = a.id) AS prozesse
      FROM arbeitsbereiche a ORDER BY a.name COLLATE NOCASE`),
    bereich: db.prepare("SELECT * FROM arbeitsbereiche WHERE id = ?"),
    bereichNachName: db.prepare("SELECT * FROM arbeitsbereiche WHERE name = ?"),
    neuerBereich: db.prepare("INSERT INTO arbeitsbereiche (id, name, erstellt) VALUES (?, ?, ?)"),
    bereichUmbenennen: db.prepare("UPDATE arbeitsbereiche SET name = ? WHERE id = ?"),
    prozessVerschieben: db.prepare("UPDATE prozesse SET arbeitsbereich_id = ? WHERE id = ?"),
    prozess: db.prepare("SELECT * FROM prozesse WHERE id = ?"),
    letzteVersion: db.prepare("SELECT * FROM prozess_versionen WHERE prozess_id = ? ORDER BY version DESC LIMIT 1"),
    version: db.prepare("SELECT * FROM prozess_versionen WHERE prozess_id = ? AND version = ?"),
    versionen: db.prepare("SELECT id, version, ki_modell, notiz, erstellt FROM prozess_versionen WHERE prozess_id = ? ORDER BY version DESC"),
    naechsteVersion: db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS n FROM prozess_versionen WHERE prozess_id = ?"),
    neuerProzess: db.prepare("INSERT INTO prozesse (id, name, erstellt, geaendert, arbeitsbereich_id) VALUES (?, ?, ?, ?, ?)"),
    prozessAktualisieren: db.prepare("UPDATE prozesse SET name = ?, geaendert = ? WHERE id = ?"),
    neueVersion: db.prepare(`
      INSERT INTO prozess_versionen (id, prozess_id, version, bpmn_xml, quelltext, ki_modell, ki_json, pruefung_json, notiz, erstellt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    loeschen: db.prepare("DELETE FROM prozesse WHERE id = ?"),
    kommentareProzess: db.prepare("SELECT * FROM kommentare WHERE prozess_id = ? ORDER BY erstellt"),
    kommentar: db.prepare("SELECT * FROM kommentare WHERE id = ?"),
    offeneKommentare: db.prepare(`
      SELECT k.*, p.name AS prozess_name FROM kommentare k JOIN prozesse p ON p.id = k.prozess_id
      WHERE k.status = 'offen' ORDER BY k.erstellt`),
    offeneKommentareBereich: db.prepare(`
      SELECT k.*, p.name AS prozess_name FROM kommentare k JOIN prozesse p ON p.id = k.prozess_id
      WHERE k.status = 'offen' AND p.arbeitsbereich_id = ? ORDER BY k.erstellt`),
    neuerKommentar: db.prepare(`
      INSERT INTO kommentare (id, prozess_id, element_id, element_name, art, text, verfasst_von, erstellt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    kommentarEntscheiden: db.prepare(`
      UPDATE kommentare SET status = ?, text = ?, entschieden_von = ?, entschieden = ?, version_uebernommen = ?
      WHERE id = ? AND status = 'offen'`)
  };

  return {
    // Ohne Angabe alle Prozesse, sonst nur die eines Arbeitsbereichs
    listeProzesse({ arbeitsbereichId = null } = {}) {
      return arbeitsbereichId ? stmts.listeBereich.all(arbeitsbereichId) : stmts.liste.all();
    },

    listeArbeitsbereiche() {
      return stmts.bereiche.all();
    },

    holeArbeitsbereich(id) {
      return stmts.bereich.get(String(id || "")) || null;
    },

    // Namen sind ohne Rücksicht auf Groß- und Kleinschreibung eindeutig; null, wenn der Name schon vergeben ist
    legeArbeitsbereichAn(name) {
      if (stmts.bereichNachName.get(name)) return null;
      const id = crypto.randomUUID();
      stmts.neuerBereich.run(id, name, jetzt());
      return stmts.bereich.get(id);
    },

    // "fehlt", "doppelt" oder der geänderte Bereich
    benenneArbeitsbereichUm(id, name) {
      if (!stmts.bereich.get(id)) return "fehlt";
      const anderer = stmts.bereichNachName.get(name);
      if (anderer && anderer.id !== id) return "doppelt";
      stmts.bereichUmbenennen.run(name, id);
      return stmts.bereich.get(id);
    },

    // Ordnet einen Prozess einem anderen Arbeitsbereich zu; ändert weder Version noch Änderungszeit
    verschiebeProzess(prozessId, arbeitsbereichId) {
      return stmts.prozessVerschieben.run(arbeitsbereichId, prozessId).changes > 0;
    },

    holeProzess(id) {
      const prozess = stmts.prozess.get(id);
      if (!prozess) return null;
      return { ...prozess, aktuell: stmts.letzteVersion.get(id) || null, versionen: stmts.versionen.all(id) };
    },

    holeVersion(prozessId, version) {
      return stmts.version.get(prozessId, version) || null;
    },

    // Legt den Prozess an, falls nötig, und speichert eine neue Version.
    // arbeitsbereichId gilt nur für neue Prozesse; bestehende bleiben in ihrem Bereich.
    speichereVersion({ prozessId, name, arbeitsbereichId = null, bpmnXml, quelltext = "", kiModell = "", kiJson = "", pruefungJson = "", notiz = "" }) {
      const zeit = jetzt();
      db.exec("BEGIN");
      try {
        let id = prozessId;
        if (!id || !stmts.prozess.get(id)) {
          id = crypto.randomUUID();
          stmts.neuerProzess.run(id, name || "Neuer Prozess", zeit, zeit, arbeitsbereichId || STANDARD_BEREICH);
        } else {
          stmts.prozessAktualisieren.run(name || stmts.prozess.get(id).name, zeit, id);
        }
        const version = stmts.naechsteVersion.get(id).n;
        stmts.neueVersion.run(crypto.randomUUID(), id, version, bpmnXml, quelltext, kiModell, kiJson, pruefungJson, notiz, zeit);
        db.exec("COMMIT");
        return { id, version };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    listeKommentare(prozessId) {
      return stmts.kommentareProzess.all(prozessId);
    },

    holeKommentar(id) {
      return stmts.kommentar.get(id) || null;
    },

    // Offene Kommentare und Vorschläge aller Prozesse oder eines Arbeitsbereichs, älteste zuerst
    offeneKommentare({ arbeitsbereichId = null } = {}) {
      return arbeitsbereichId ? stmts.offeneKommentareBereich.all(arbeitsbereichId) : stmts.offeneKommentare.all();
    },

    speichereKommentar({ prozessId, elementId, elementName = "", art, text, verfasstVon = "" }) {
      const id = crypto.randomUUID();
      stmts.neuerKommentar.run(id, prozessId, elementId, elementName, art, text, verfasstVon, jetzt());
      return stmts.kommentar.get(id);
    },

    // Nur offene Einträge lassen sich entscheiden; false, wenn schon entschieden
    entscheideKommentar(id, { status, text, entschiedenVon = "", versionUebernommen = null }) {
      return stmts.kommentarEntscheiden.run(status, text, entschiedenVon, jetzt(), versionUebernommen, id).changes > 0;
    },

    loescheProzess(id) {
      return stmts.loeschen.run(id).changes > 0;
    },

    schliessen() {
      db.close();
    }
  };
}
