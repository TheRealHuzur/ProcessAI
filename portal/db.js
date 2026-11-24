// Datenbank des Kundenportals (SQLite, eigene Datei im Volume des Portals).
// Jeder Bereich zählt seine Migrationen selbst: "konten" für den Kontokern, "modul:<id>" je Modul.
// So kann ein neues Modul eigene Tabellen anlegen, ohne die anderen anzufassen.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { KONTEN_MIGRATIONEN } from "../konten/index.js";

function fuehreAus(db, bereich, migrationen) {
  const zeile = db.prepare("SELECT version FROM schema_stand WHERE bereich = ?").get(bereich);
  const stand = zeile ? zeile.version : 0;
  for (let i = stand; i < migrationen.length; i += 1) {
    db.exec("BEGIN");
    try {
      db.exec(migrationen[i]);
      db.prepare(`INSERT INTO schema_stand (bereich, version) VALUES (?, ?)
                  ON CONFLICT (bereich) DO UPDATE SET version = excluded.version`).run(bereich, i + 1);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${i + 1} im Bereich ${bereich} fehlgeschlagen: ${error.message}`);
    }
  }
}

export function oeffnePortalDatenbank(dataDir, module) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "portal.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_stand (bereich TEXT PRIMARY KEY, version INTEGER NOT NULL)");
  fuehreAus(db, "konten", KONTEN_MIGRATIONEN);
  for (const modul of module) fuehreAus(db, `modul:${modul.id}`, modul.migrationen || []);
  return db;
}
