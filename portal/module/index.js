// Alle Module des Kundenportals. Ein neues Modul: eigener Ordner unter portal/module/<id>/
// mit modul.js (Steckbrief, siehe unten) und hier eine Zeile. Verwaltung, Startseite,
// Zugangssperre und Datenbank lesen nur diese Liste; am Kontokern ändert sich nichts.
//
// Steckbrief eines Moduls:
//   id            fest, klein, nie ändern (steht in der Freischaltung je Mandant)
//   name          Anzeige in Startseite und Verwaltung
//   beschreibung  ein Satz für die Kachel
//   migrationen   eigene Tabellen (SQL-Liste, nur anhängen); jede Tabelle mit mandant_id
//   oberflaeche   Ordner mit index.html, erreichbar unter /m/<id>/
//   router(ctx)   Express-Router unter /api/m/<id>; req.mandant ist gesetzt und freigeschaltet.
//                 ctx: { db, kern, datenDir } mit eigenem Datenordner je Modul
import handbuch from "./handbuch/modul.js";

export const MODULE = [handbuch];

export function pruefeModule(module) {
  const ids = new Set();
  for (const m of module) {
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(m.id || "")) throw new Error(`Ungültige Modul-ID: ${m.id}`);
    if (ids.has(m.id)) throw new Error(`Modul-ID doppelt: ${m.id}`);
    if (!m.name || typeof m.router !== "function" || !m.oberflaeche) throw new Error(`Steckbrief unvollständig: ${m.id}`);
    ids.add(m.id);
  }
  return module;
}
