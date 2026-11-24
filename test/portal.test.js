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
  assert.equal((await amtA("/m/handbuch/")).status, 200);
});

test("Handbuch: hochladen, ersetzen, PDF; alle Uploads bleiben auf dem Server", async () => {
  const hoch = (inhalt, name) => amtA("/api/m/handbuch/uploads", { method: "POST", roh: inhalt, headers: { "X-Dateiname": encodeURIComponent(name) } });
  const erster = await hoch(teilprozesse, "Rechnung_bezahlen.bpmn");
  assert.equal(erster.status, 201);
  assert.equal(erster.daten.upload.status, "ok");
  assert.equal(erster.daten.upload.titel, "Rechnung bezahlen");
  const zweiter = await hoch(teilprozesse, "rechnung_bezahlen.BPMN");
  assert.equal(zweiter.daten.upload.version, 2);
  const kaputt = await hoch("<kein bpmn", "Kaputt.bpmn");
  assert.equal(kaputt.status, 201);
  assert.equal(kaputt.daten.upload.status, "fehler");
  assert.equal((await hoch(teilprozesse, "bild.png")).status, 400);
  assert.equal((await hoch("", "leer.bpmn")).status, 400);

  const liste = (await amtA("/api/m/handbuch/uploads")).daten.uploads;
  assert.deepEqual(liste.map((u) => [u.dateiname, u.version]), [["Kaputt.bpmn", 1], ["rechnung_bezahlen.BPMN", 2]]);
  const dateien = fs.readdirSync(path.join(tmp, "module", "handbuch", "uploads", idA));
  assert.equal(dateien.length, 3);

  const pdf = await amtA(`/api/m/handbuch/uploads/${zweiter.daten.upload.id}/handbuch.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(pdf.daten.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await amtA(`/api/m/handbuch/uploads/${kaputt.daten.upload.id}/handbuch.pdf`)).status, 422);
});

test("Mandanten sehen nur ihre eigenen Daten", async () => {
  const liste = (await amtA("/api/m/handbuch/uploads")).daten.uploads;
  assert.deepEqual((await amtB("/api/m/handbuch/uploads")).daten.uploads, []);
  assert.equal((await amtB(`/api/m/handbuch/uploads/${liste[0].id}/handbuch.pdf`)).status, 404);
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
  // Sperren wirkt sofort, auch in einer laufenden Sitzung
  await admin(`/api/verwaltung/mandanten/${idA}/module/notizen`, { method: "PUT", body: { an: false } });
  assert.equal((await amtA("/api/m/notizen")).status, 403);
});

test("Migrationen je Bereich: erneutes Öffnen ändert nichts, neues Modul kommt dazu", () => {
  const db = oeffnePortalDatenbank(tmp, [...MODULE, notizen]);
  const stand = db.prepare("SELECT bereich, version FROM schema_stand ORDER BY bereich").all().map((z) => [z.bereich, z.version]);
  assert.deepEqual(stand, [["konten", 1], ["modul:handbuch", 1], ["modul:notizen", 1]]);
  db.close();
});

test("Gesperrter Mandant und neues Passwort", async () => {
  await admin(`/api/verwaltung/mandanten/${idB}`, { method: "PATCH", body: { aktiv: false } });
  assert.equal((await amtB("/api/m/handbuch/uploads")).status, 401);
  assert.equal((await amtB("/api/anmelden", { method: "POST", body: { benutzername: "kreis-b", passwort: "passwort-b1" } })).status, 401);
  await admin(`/api/verwaltung/mandanten/${idB}`, { method: "PATCH", body: { aktiv: true, passwort: "neues-pw-b2" } });
  assert.equal((await amtB("/api/anmelden", { method: "POST", body: { benutzername: "kreis-b", passwort: "neues-pw-b2" } })).status, 200);
  const p = await admin("/api/verwaltung/protokoll");
  assert.ok(p.daten.eintraege.some((e) => e.aktion === "hochgeladen" && e.ergebnis === "fehler"));
});

test("Titel aus Dateiname", () => {
  assert.equal(titelAusDateiname("ZPD_Externe_Beratung.bpmn"), "ZPD Externe Beratung");
  assert.equal(titelAusDateiname("Antrag auf Teilzeit bearbeiten.XML"), "Antrag auf Teilzeit bearbeiten");
});
