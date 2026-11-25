// Kundenportal: Verwaltung, Anmeldung je Mandant, Freischaltung, Trennung der Mandanten,
// Handbuch-Generator, und ein zweites Modul ohne Änderung am Kontokern (Erweiterbarkeit).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { erstellePortal } from "../portal/server.js";
import { oeffnePortalDatenbank } from "../portal/db.js";
import { MODULE } from "../portal/module/index.js";
import { titelAusDateiname } from "../portal/module/handbuch/modul.js";
import { hashePasswort, passwortPasst } from "../konten/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const teilprozesse = fs.readFileSync(path.join(__dirname, "fixtures", "teilprozesse.bpmn"), "utf8");

// Zweites Modul nur für den Test: eigene Tabelle, eigene Schnittstelle, eigene Seite
const notizen = {
  id: "notizen",
  name: "Notizen",
  beschreibung: "Testmodul",
  migrationen: ["CREATE TABLE nz_notizen (id INTEGER PRIMARY KEY, mandant_id TEXT NOT NULL, text TEXT NOT NULL);"],
  oberflaeche: path.join(__dirname, "fixtures"),
  router({ db }) {
    const r = express.Router();
    r.use(express.json());
    r.get("/", (req, res) => res.json({ notizen: db.prepare("SELECT text FROM nz_notizen WHERE mandant_id = ?").all(req.mandant.id).map((n) => n.text) }));
    r.post("/", (req, res) => {
      db.prepare("INSERT INTO nz_notizen (mandant_id, text) VALUES (?, ?)").run(req.mandant.id, String(req.body.text));
      res.status(201).json({ ok: true });
    });
    return r;
  }
};

let server;
let basis;
let tmp;

// Kleiner Client mit eigenem Cookie-Speicher (je Rolle einer)
function client() {
  const cookies = new Map();
  return async function anfrage(pfad, { method = "GET", body, roh, headers = {} } = {}) {
    const h = { ...headers };
    if (cookies.size) h.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (body !== undefined && !roh) h["Content-Type"] = "application/json";
    const res = await fetch(`${basis}${pfad}`, { method, headers: h, body: roh ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const [k, ...v] = kv.split("=");
      if (v.join("=")) cookies.set(k, v.join("="));
      else cookies.delete(k);
    }
    const typ = res.headers.get("content-type") || "";
    const daten = typ.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, daten, headers: res.headers };
  };
}

const admin = client();
const amtA = client();
const amtB = client();
let idA;
let idB;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portal-"));
  const module = [...MODULE, notizen];
  const db = oeffnePortalDatenbank(tmp, module);
  const config = { dataDir: tmp, sessionSecret: "test-geheim", adminPasswort: "admin-geheim", sitzungTage: 1 };
  const app = erstellePortal({ db, config, module });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  basis = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Passwort wird als Hash gespeichert und geprüft", () => {
  const h = hashePasswort("richtig-123");
  assert.match(h, /^scrypt\$/);
  assert.ok(!h.includes("richtig-123"));
  assert.ok(passwortPasst("richtig-123", h));
  assert.ok(!passwortPasst("falsch-123", h));
});

test("Verwaltung nur mit Passwort", async () => {
  assert.equal((await admin("/api/verwaltung/mandanten")).status, 401);
  assert.equal((await admin("/api/verwaltung/anmelden", { method: "POST", body: { passwort: "falsch" } })).status, 401);
  assert.equal((await admin("/api/verwaltung/anmelden", { method: "POST", body: { passwort: "admin-geheim" } })).status, 200);
  const m = await admin("/api/verwaltung/module");
  assert.deepEqual(m.daten.module.map((x) => x.id), ["handbuch", "notizen"]);
});

test("Mandanten anlegen; Benutzername eindeutig, Passwort mit Mindestlänge", async () => {
  const a = await admin("/api/verwaltung/mandanten", { method: "POST", body: { name: "Stadt A", benutzername: "stadt-a", passwort: "passwort-a1" } });
  assert.equal(a.status, 201);
  idA = a.daten.mandant.id;
  assert.equal(a.daten.mandant.passwort_hash, undefined);
  const b = await admin("/api/verwaltung/mandanten", { method: "POST", body: { name: "Kreis B", benutzername: "kreis-b", passwort: "passwort-b1" } });
  idB = b.daten.mandant.id;
  assert.equal((await admin("/api/verwaltung/mandanten", { method: "POST", body: { name: "X", benutzername: "STADT-A", passwort: "passwort-x1" } })).status, 409);
  assert.equal((await admin("/api/verwaltung/mandanten", { method: "POST", body: { name: "X", benutzername: "x", passwort: "kurz" } })).status, 400);
});

test("Anmeldung je Mandant; ohne Freischaltung kein Modul", async () => {
  assert.equal((await amtA("/api/anmelden", { method: "POST", body: { benutzername: "stadt-a", passwort: "falsch-123" } })).status, 401);
  const login = await amtA("/api/anmelden", { method: "POST", body: { benutzername: "stadt-a", passwort: "passwort-a1" } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.daten.module, []);
  assert.equal((await amtA("/api/m/handbuch/uploads")).status, 403);
  assert.equal((await amtA("/m/handbuch/")).status, 302);
  assert.equal((await amtB("/api/m/handbuch/uploads")).status, 401);
});

test("Freischalten je Mandant und Modul, Lizenz test oder voll", async () => {
  assert.equal((await admin(`/api/verwaltung/mandanten/${idA}/module/handbuch`, { method: "PUT", body: { an: true } })).status, 200);
  assert.equal((await admin(`/api/verwaltung/mandanten/${idA}/module/gibtsnicht`, { method: "PUT", body: { an: true } })).status, 404);
  const b = await admin(`/api/verwaltung/mandanten/${idB}/module/handbuch`, { method: "PUT", body: { an: true, lizenz: "voll" } });
  assert.deepEqual(b.daten.mandant.module.map((x) => [x.modul_id, x.lizenz]), [["handbuch", "voll"]]);
  await amtB("/api/anmelden", { method: "POST", body: { benutzername: "kreis-b", passwort: "passwort-b1" } });
  const s = await amtA("/api/sitzung");
  assert.deepEqual(s.daten.module.map((x) => x.id), ["handbuch"]);
  // Werkzeugkarte der Startseite: Daten aus dem Steckbrief
  assert.deepEqual(s.daten.module[0], {
    id: "handbuch", name: "Logbuch", icon: "book", knopf: "Handbuch erstellen", adresse: "/m/handbuch/",
    beschreibung: "BPMN-Modell hochladen (auch mehrere Dateien), Titel eingeben und ein Handbuch als PDF erstellen."
  });
  assert.equal((await amtA("/m/handbuch/")).status, 200);
});

test("Logbuch: Datei und Titel rein, PDF raus; jede Datei bleibt im Hintergrund auf dem Server", async () => {
  const erstelle = (client, inhalt, name, titel) => client("/api/m/handbuch/erstellen", { method: "POST", body: { titel, dateien: [{ name, inhalt }] } });
  const pdf = await erstelle(amtA, teilprozesse, "Rechnung_bezahlen.bpmn", "Rechnung bezahlen in der Stadtkasse");
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.match(pdf.headers.get("content-disposition"), /Rechnung%20bezahlen%20in%20der%20Stadtkasse%20Handbuch\.pdf/);
  assert.equal(pdf.daten.subarray(0, 5).toString(), "%PDF-");
  // Gleicher Name noch einmal: wieder ein PDF, nichts wird ersetzt oder angezeigt
  assert.equal((await erstelle(amtA, teilprozesse, "Rechnung_bezahlen.bpmn")).status, 200);
  const kaputt = await erstelle(amtA, "<kein bpmn", "Kaputt.bpmn", "Kaputt");
  assert.equal(kaputt.status, 422);
  assert.match(kaputt.daten.fehler, /kein gültiges BPMN/);
  assert.equal((await erstelle(amtA, teilprozesse, "bild.png", "Bild")).status, 400);
  assert.equal((await erstelle(amtA, "", "leer.bpmn", "Leer")).status, 400);
  assert.equal((await erstelle(amtB, teilprozesse, "Anderer_Prozess.bpmn", "Anderer Prozess")).status, 200);

  // Im Hintergrund: alle Dateien je Mandant abgelegt und vermerkt, auch die kaputte
  const ordner = (id) => fs.readdirSync(path.join(tmp, "module", "handbuch", "uploads", id));
  assert.equal(ordner(idA).length, 3);
  assert.equal(ordner(idB).length, 1);
  const db = oeffnePortalDatenbank(tmp, [...MODULE, notizen]);
  const zeilen = db.prepare("SELECT mandant_id, titel, status FROM hb_uploads ORDER BY hochgeladen").all();
  db.close();
  assert.deepEqual(zeilen.map((z) => [z.mandant_id === idA ? "A" : "B", z.titel, z.status]), [
    ["A", "Rechnung bezahlen in der Stadtkasse", "ok"],
    ["A", "Rechnung bezahlen", "ok"],
    ["A", "Kaputt", "fehler"],
    ["B", "Anderer Prozess", "ok"]
  ]);
  // Der Kunde sieht keine Liste früherer Dateien
  assert.equal((await amtA("/api/m/handbuch/uploads")).status, 404);
});

test("Logbuch: mehrere Dateien zu einem Handbuch, jede Datei abgelegt, gemeinsamer Vorgang", async () => {
  const fixture = (n) => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8");
  const dateien = [
    { name: "PICTURE_Unterdiagramm.bpmn", inhalt: fixture("picture-geteilt-unterdiagramm.bpmn") },
    { name: "PICTURE_Hauptdiagramm.bpmn", inhalt: fixture("picture-geteilt-haupt.bpmn") }
  ];
  const vorher = fs.readdirSync(path.join(tmp, "module", "handbuch", "uploads", idA)).length;
  const pdf = await amtA("/api/m/handbuch/erstellen", { method: "POST", body: { titel: "Seminar", dateien } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.daten.subarray(0, 5).toString(), "%PDF-");
  assert.equal(fs.readdirSync(path.join(tmp, "module", "handbuch", "uploads", idA)).length, vorher + 2);
  const db = oeffnePortalDatenbank(tmp, [...MODULE, notizen]);
  const zeilen = db.prepare("SELECT vorgang, dateiname FROM hb_uploads WHERE titel = 'Seminar'").all();
  const gesamt = db.prepare("SELECT COUNT(*) AS zeilen, COUNT(DISTINCT vorgang) AS vorgaenge FROM hb_uploads").get();
  db.close();
  assert.equal(zeilen.length, 2);
  assert.equal(new Set(zeilen.map((z) => z.vorgang)).size, 1);
  assert.equal(gesamt.zeilen - gesamt.vorgaenge, 1, "nur die zwei Dateien dieses Aufrufs teilen sich einen Vorgang");

  const kaputt = await amtA("/api/m/handbuch/erstellen", { method: "POST", body: { titel: "X", dateien: [dateien[0], { name: "Kaputt.bpmn", inhalt: "<kein" }] } });
  assert.equal(kaputt.status, 422);
  assert.match(kaputt.daten.fehler, /„Kaputt\.bpmn“/);
  assert.equal((await amtA("/api/m/handbuch/erstellen", { method: "POST", body: { titel: "X", dateien: [] } })).status, 400);
  const zuViele = Array.from({ length: 21 }, (_, i) => ({ name: `d${i}.bpmn`, inhalt: "<x/>" }));
  assert.equal((await amtA("/api/m/handbuch/erstellen", { method: "POST", body: { titel: "X", dateien: zuViele } })).status, 400);
});

test("Weiteres Modul ohne Änderung am Kontokern: freischalten, eigene Daten je Mandant", async () => {
  assert.equal((await amtA("/api/m/notizen")).status, 403);
  await admin(`/api/verwaltung/mandanten/${idA}/module/notizen`, { method: "PUT", body: { an: true } });
  await admin(`/api/verwaltung/mandanten/${idB}/module/notizen`, { method: "PUT", body: { an: true } });
  assert.equal((await amtA("/api/m/notizen", { method: "POST", body: { text: "nur für A" } })).status, 201);
  assert.deepEqual((await amtA("/api/m/notizen")).daten.notizen, ["nur für A"]);
  assert.deepEqual((await amtB("/api/m/notizen")).daten.notizen, []);
  const s = await amtA("/api/sitzung");
  assert.deepEqual(s.daten.module.map((x) => x.id), ["handbuch", "notizen"]);
  // Steckbrief ohne Icon und Buttontext: Karte ohne Icon, Button „Öffnen“
  assert.deepEqual([s.daten.module[1].icon, s.daten.module[1].knopf], ["", "Öffnen"]);
  // Sperren wirkt sofort, auch in einer laufenden Sitzung
  await admin(`/api/verwaltung/mandanten/${idA}/module/notizen`, { method: "PUT", body: { an: false } });
  assert.equal((await amtA("/api/m/notizen")).status, 403);
});

test("Migrationen je Bereich: erneutes Öffnen ändert nichts, neues Modul kommt dazu", () => {
  const db = oeffnePortalDatenbank(tmp, [...MODULE, notizen]);
  const stand = db.prepare("SELECT bereich, version FROM schema_stand ORDER BY bereich").all().map((z) => [z.bereich, z.version]);
  assert.deepEqual(stand, [["konten", 1], ["modul:handbuch", 2], ["modul:notizen", 1]]);
  db.close();
});

test("Gesperrter Mandant und neues Passwort", async () => {
  await admin(`/api/verwaltung/mandanten/${idB}`, { method: "PATCH", body: { aktiv: false } });
  assert.equal((await amtB("/api/m/handbuch/uploads")).status, 401);
  assert.equal((await amtB("/api/anmelden", { method: "POST", body: { benutzername: "kreis-b", passwort: "passwort-b1" } })).status, 401);
  await admin(`/api/verwaltung/mandanten/${idB}`, { method: "PATCH", body: { aktiv: true, passwort: "neues-pw-b2" } });
  assert.equal((await amtB("/api/anmelden", { method: "POST", body: { benutzername: "kreis-b", passwort: "neues-pw-b2" } })).status, 200);
  const p = await admin("/api/verwaltung/protokoll");
  assert.ok(p.daten.eintraege.some((e) => e.aktion === "handbuch erstellt" && e.ergebnis === "fehler"));
});

test("Titel aus Dateiname", () => {
  assert.equal(titelAusDateiname("ZPD_Externe_Beratung.bpmn"), "ZPD Externe Beratung");
  assert.equal(titelAusDateiname("Antrag auf Teilzeit bearbeiten.XML"), "Antrag auf Teilzeit bearbeiten");
});

test("Stilvorlage: ohne Anmeldung erreichbar, Schriften lokal, keine Google-Server", async () => {
  const gast = client();
  const css = await gast("/stil/prozesspilot.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  const text = css.daten.toString("utf8");
  const schriften = [...text.matchAll(/url\("(schriften\/[^"]+)"\)/g)].map((t) => t[1]);
  assert.equal(schriften.length, 7, "Montserrat 400 bis 700, Roboto 400, 500, 700");
  for (const datei of schriften) assert.equal((await gast(`/stil/${datei}`)).status, 200, datei);
  assert.equal((await gast("/stil/logo-wissen-und-werkzeug.png")).status, 200);
  assert.equal((await gast("/stil/gibtsnicht.css")).status, 404);
  const startseite = (await gast("/")).daten.toString("utf8");
  for (const inhalt of [text, startseite]) assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(inhalt));
  assert.ok(startseite.includes('href="/stil/prozesspilot.css"'));
});

test("Jedes Modul nennt ein vorhandenes Icon und einen Buttontext", () => {
  const icons = fs.readFileSync(path.join(__dirname, "..", "kern", "stil", "icons.js"), "utf8");
  for (const m of MODULE) {
    assert.ok(m.knopf, `${m.id}: knopf fehlt`);
    assert.ok(new RegExp(`\\b${m.icon}: '`).test(icons), `${m.id}: Icon ${m.icon} fehlt in kern/stil/icons.js`);
  }
});

test("Alle Seiten des Portals nutzen die zentrale Stilvorlage", () => {
  const seiten = ["portal/oberflaeche/index.html", "portal/oberflaeche/verwaltung/index.html", "portal/module/handbuch/oberflaeche/index.html"];
  for (const seite of seiten) {
    const html = fs.readFileSync(path.join(__dirname, "..", seite), "utf8");
    assert.ok(html.includes('href="/stil/prozesspilot.css"'), seite);
    assert.ok(!html.includes("/portal.css"), `${seite} lädt noch die alte Vorlage`);
  }
});
