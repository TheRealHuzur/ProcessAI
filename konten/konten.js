// Kontokern: Mandanten mit genau einem Zugang, freigeschaltete Module je Mandant, Protokoll.
// Kennt keine Module im Einzelnen; welche es gibt, weiß die App, die den Kern nutzt.
import crypto from "node:crypto";
import { hashePasswort, passwortPasst, verschluessele, entschluessele } from "./passwort.js";

// Schema des Kontokerns, als Bereich "konten" fortgezählt (siehe portal/db.js)
export const KONTEN_MIGRATIONEN = [
  `CREATE TABLE mandanten (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     benutzername TEXT NOT NULL COLLATE NOCASE UNIQUE,
     passwort_hash TEXT NOT NULL,
     aktiv INTEGER NOT NULL DEFAULT 1,
     angelegt TEXT NOT NULL,
     geaendert TEXT NOT NULL
   );
   CREATE TABLE mandant_module (
     mandant_id TEXT NOT NULL REFERENCES mandanten(id),
     modul_id TEXT NOT NULL,
     lizenz TEXT NOT NULL DEFAULT 'test' CHECK (lizenz IN ('test', 'voll')),
     seit TEXT NOT NULL,
     PRIMARY KEY (mandant_id, modul_id)
   );
   CREATE TABLE protokoll (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     zeit TEXT NOT NULL,
     mandant_id TEXT,
     modul_id TEXT NOT NULL DEFAULT '',
     aktion TEXT NOT NULL,
     ergebnis TEXT NOT NULL CHECK (ergebnis IN ('ok', 'fehler')),
     details TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX idx_protokoll_mandant ON protokoll(mandant_id, id DESC);`,
  // Lesbare (verschlüsselte) Kopie des Passworts für die Verwaltung; Mandant in Auswertungen zählen oder nicht (z. B. eigener Testzugang)
  `ALTER TABLE mandanten ADD COLUMN passwort_lesbar TEXT NOT NULL DEFAULT '';
   ALTER TABLE mandanten ADD COLUMN auswerten INTEGER NOT NULL DEFAULT 1;`
];

export const LIZENZEN = ["test", "voll"];
const MIN_PASSWORT = 8;
const MAX_TEXT = 120;
// Platzhalter, damit eine Anmeldung mit unbekanntem Namen gleich lange dauert
const LEER_HASH = hashePasswort(crypto.randomBytes(12).toString("hex"));

export class KontenFehler extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function jetzt() {
  return new Date().toISOString();
}

function text(wert, feld) {
  const t = String(wert ?? "").replace(/\s+/g, " ").trim();
  if (!t) throw new KontenFehler(`${feld} fehlt.`);
  if (t.length > MAX_TEXT) throw new KontenFehler(`${feld} ist zu lang (höchstens ${MAX_TEXT} Zeichen).`);
  return t;
}

function benutzername(wert) {
  const t = text(wert, "Benutzername");
  if (!/^[\p{L}\p{N}._@-]+$/u.test(t)) throw new KontenFehler("Benutzername nur aus Buchstaben, Ziffern und . _ @ - ohne Leerzeichen.");
  return t;
}

function passwort(wert) {
  const p = String(wert ?? "");
  if (p.length < MIN_PASSWORT) throw new KontenFehler(`Passwort mit mindestens ${MIN_PASSWORT} Zeichen.`);
  if (p.length > 200) throw new KontenFehler("Passwort ist zu lang.");
  return p;
}

// schluessel: Geheimnis für die lesbare Kopie der Passwörter; ohne Schlüssel wird keine Kopie gespeichert
export function kontokern(db, { schluessel = "" } = {}) {
  const lesbar = (pw) => (schluessel ? verschluessele(pw, schluessel) : "");
  const q = {
    alle: db.prepare("SELECT id, name, benutzername, aktiv, auswerten, angelegt, geaendert FROM mandanten ORDER BY name COLLATE NOCASE"),
    eins: db.prepare("SELECT id, name, benutzername, aktiv, auswerten, angelegt, geaendert FROM mandanten WHERE id = ?"),
    passwortLesbar: db.prepare("SELECT passwort_lesbar FROM mandanten WHERE id = ?"),
    nachName: db.prepare("SELECT * FROM mandanten WHERE benutzername = ?"),
    anlegen: db.prepare("INSERT INTO mandanten (id, name, benutzername, passwort_hash, passwort_lesbar, aktiv, angelegt, geaendert) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"),
    module: db.prepare("SELECT modul_id, lizenz, seit FROM mandant_module WHERE mandant_id = ? ORDER BY modul_id"),
    modulAn: db.prepare(`INSERT INTO mandant_module (mandant_id, modul_id, lizenz, seit) VALUES (?, ?, ?, ?)
                         ON CONFLICT (mandant_id, modul_id) DO UPDATE SET lizenz = excluded.lizenz`),
    modulAus: db.prepare("DELETE FROM mandant_module WHERE mandant_id = ? AND modul_id = ?"),
    protokollieren: db.prepare("INSERT INTO protokoll (zeit, mandant_id, modul_id, aktion, ergebnis, details) VALUES (?, ?, ?, ?, ?, ?)"),
    protokollAlle: db.prepare("SELECT * FROM protokoll ORDER BY id DESC LIMIT ?"),
    protokollMandant: db.prepare("SELECT * FROM protokoll WHERE mandant_id = ? ORDER BY id DESC LIMIT ?"),
    // Nutzung je Mandant aus dem Protokoll; Aktionen der Verwaltung zählen nicht
    nutzung: db.prepare(`SELECT m.id, m.name, m.benutzername, m.aktiv,
        SUM(p.aktion = 'anmelden' AND p.ergebnis = 'ok') AS anmeldungen,
        SUM(p.aktion = 'anmelden' AND p.ergebnis = 'fehler') AS fehlversuche,
        SUM(p.aktion = 'besuch') AS besuche,
        MAX(CASE WHEN p.aktion = 'anmelden' AND p.ergebnis = 'ok' THEN p.zeit END) AS letzte_anmeldung,
        MAX(CASE WHEN p.aktion NOT LIKE 'verwaltung:%' AND p.ergebnis = 'ok' THEN p.zeit END) AS zuletzt_aktiv
      FROM mandanten m LEFT JOIN protokoll p ON p.mandant_id = m.id
      GROUP BY m.id ORDER BY zuletzt_aktiv IS NULL, zuletzt_aktiv DESC, m.name COLLATE NOCASE`),
    aktionenJeMandant: db.prepare(`SELECT mandant_id, modul_id, aktion, ergebnis, COUNT(*) AS anzahl, MAX(zeit) AS zuletzt
      FROM protokoll WHERE mandant_id IS NOT NULL AND modul_id <> '' GROUP BY mandant_id, modul_id, aktion, ergebnis`)
  };

  const mitModulen = (m) => m && ({ ...m, aktiv: Boolean(m.aktiv), auswerten: Boolean(m.auswerten), module: q.module.all(m.id) });

  function holen(id) {
    const m = mitModulen(q.eins.get(String(id)));
    if (!m) throw new KontenFehler("Mandant nicht gefunden.", 404);
    return m;
  }

  function eindeutig(name, ausserId = null) {
    const vorhanden = q.nachName.get(name);
    if (vorhanden && vorhanden.id !== ausserId) throw new KontenFehler("Diesen Benutzernamen gibt es schon.", 409);
  }

  return {
    liste: () => q.alle.all().map(mitModulen),
    holen,

    anlegen({ name, benutzername: bn, passwort: pw }) {
      const n = text(name, "Name");
      const b = benutzername(bn);
      const p = passwort(pw);
      eindeutig(b);
      const id = crypto.randomUUID();
      const zeit = jetzt();
      q.anlegen.run(id, n, b, hashePasswort(p), lesbar(p), zeit, zeit);
      return holen(id);
    },

    // Nur übergebene Felder ändern; Passwort setzt Patrick, es gibt kein Zurücksetzen per Mail
    aendern(id, { name, benutzername: bn, passwort: pw, aktiv, auswerten } = {}) {
      const alt = holen(id);
      const felder = [];
      const werte = [];
      if (name !== undefined) { felder.push("name = ?"); werte.push(text(name, "Name")); }
      if (bn !== undefined) {
        const b = benutzername(bn);
        eindeutig(b, alt.id);
        felder.push("benutzername = ?"); werte.push(b);
      }
      if (pw !== undefined && pw !== "") {
        const p = passwort(pw);
        felder.push("passwort_hash = ?", "passwort_lesbar = ?");
        werte.push(hashePasswort(p), lesbar(p));
      }
      if (aktiv !== undefined) { felder.push("aktiv = ?"); werte.push(aktiv ? 1 : 0); }
      if (auswerten !== undefined) { felder.push("auswerten = ?"); werte.push(auswerten ? 1 : 0); }
      if (felder.length) {
        db.prepare(`UPDATE mandanten SET ${felder.join(", ")}, geaendert = ? WHERE id = ?`).run(...werte, jetzt(), alt.id);
      }
      return holen(alt.id);
    },

    // Modul freischalten (an) oder sperren; welche Modul-IDs gültig sind, prüft die App
    modulSetzen(id, modulId, { an, lizenz = "test" }) {
      const m = holen(id);
      if (!LIZENZEN.includes(lizenz)) throw new KontenFehler("Unbekannte Lizenz.");
      if (an) q.modulAn.run(m.id, String(modulId), lizenz, jetzt());
      else q.modulAus.run(m.id, String(modulId));
      return holen(m.id);
    },

    hatModul(id, modulId) {
      return q.module.all(String(id)).some((x) => x.modul_id === modulId);
    },

    // Mandant bei passendem Zugang, sonst null; gesperrte Mandanten kommen nicht hinein
    pruefeZugang(bn, pw) {
      const m = q.nachName.get(String(bn ?? "").trim());
      const passt = passwortPasst(String(pw ?? ""), m ? m.passwort_hash : LEER_HASH);
      if (!m || !passt || !m.aktiv) return null;
      return holen(m.id);
    },

    // Passwort im Klartext für die Verwaltung; null, wenn keine lesbare Kopie da ist (vor dem 25.11.2026 gesetzt) oder der Schlüssel nicht passt
    passwortAnzeigen(id) {
      const m = holen(id);
      return schluessel ? entschluessele(q.passwortLesbar.get(m.id).passwort_lesbar, schluessel) : null;
    },

    // IDs der Mandanten, die in Auswertungen nicht zählen
    nichtAusgewertet() {
      return new Set(q.alle.all().filter((m) => !m.auswerten).map((m) => m.id));
    },

    // ID des Mandanten zu einem Benutzernamen (auch gesperrt), sonst null; nur fürs Protokoll
    kennung(bn) {
      const m = q.nachName.get(String(bn ?? "").trim());
      return m ? m.id : null;
    },

    // Aktiver Mandant zur ID aus der Sitzung, sonst null
    aktiverMandant(id) {
      const m = mitModulen(q.eins.get(String(id)));
      return m && m.aktiv ? m : null;
    },

    protokolliere({ mandantId = null, modulId = "", aktion, ergebnis = "ok", details = "" }) {
      q.protokollieren.run(jetzt(), mandantId, modulId, String(aktion), ergebnis, String(details).slice(0, 500));
    },

    protokoll({ mandantId = null, anzahl = 200 } = {}) {
      return mandantId ? q.protokollMandant.all(mandantId, anzahl) : q.protokollAlle.all(anzahl);
    },

    // Je Mandant: Anmeldungen, Fehlversuche, Besuche, letzte Anmeldung, zuletzt aktiv, dazu Aktionen je Modul
    nutzung() {
      const aktionen = q.aktionenJeMandant.all();
      return q.nutzung.all().map((m) => ({
        ...m,
        aktiv: Boolean(m.aktiv),
        anmeldungen: m.anmeldungen || 0,
        fehlversuche: m.fehlversuche || 0,
        besuche: m.besuche || 0,
        module: aktionen.filter((a) => a.mandant_id === m.id).map(({ mandant_id, ...a }) => a)
      }));
    }
  };
}
