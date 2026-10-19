import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

// Nachgebauter Whisper-Dienst: merkt sich die letzte Anfrage und antwortet wie faster-whisper-server
let letzte = null;
let antwortStatus = 200;
const whisper = http.createServer(async (req, res) => {
  const teile = [];
  for await (const teil of req) teile.push(teil);
  const form = await new Response(Buffer.concat(teile), { headers: { "content-type": req.headers["content-type"] } }).formData();
  const datei = form.get("file");
  letzte = { pfad: req.url, felder: Object.fromEntries([...form.entries()].filter(([name]) => name !== "file")), datei: { name: datei.name, typ: datei.type, groesse: datei.size } };
  res.writeHead(antwortStatus, { "content-type": "application/json" });
  res.end(JSON.stringify(antwortStatus === 200 ? { text: "  Der Antrag geht ein. " } : { detail: "kaputt" }));
});
await new Promise((resolve) => whisper.listen(0, "127.0.0.1", resolve));

process.env.APP_PASSWORD = "geheim";
process.env.SESSION_SECRET = "test-secret";
process.env.WHISPER_BASE_URL = `http://127.0.0.1:${whisper.address().port}/v1/`;
process.env.WHISPER_PROMPT = "Verwaltung";

const { erstelleApp } = await import("../server/index.js");
const { oeffneDatenbank } = await import("../server/db.js");
const { config } = await import("../server/config.js");
const { verschrifte, SpracheFehler } = await import("../server/sprache.js");

let server;
let basis;
let cookie = "";
let tmp;
const audio = Buffer.from("so tun, als wäre das Opus");

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pp-"));
  const app = erstelleApp({ db: oeffneDatenbank(tmp) });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  basis = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${basis}/api/anmelden`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passwort: "geheim" }) });
  cookie = res.headers.get("set-cookie").split(";")[0];
});

after(() => {
  server.close();
  whisper.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Adresse wird ohne /v1 und Schrägstrich übernommen", () => {
  assert.equal(config.whisper.baseUrl, `http://127.0.0.1:${whisper.address().port}`);
});

test("verschrifte schickt Datei, Sprache, Stillefilter und Zusammenhang", async () => {
  antwortStatus = 200;
  const text = await verschrifte(audio, { mimeType: "audio/webm;codecs=opus", vorher: "Zuerst kommt die Post." });
  assert.equal(text, "Der Antrag geht ein.");
  assert.equal(letzte.pfad, "/v1/audio/transcriptions");
  assert.equal(letzte.felder.language, "de");
  assert.equal(letzte.felder.response_format, "json");
  assert.equal(letzte.felder.vad_filter, "true");
  assert.equal(letzte.felder.prompt, "Verwaltung Zuerst kommt die Post.");
  assert.equal(letzte.felder.model, undefined, "ohne WHISPER_MODEL entscheidet der Dienst");
  assert.deepEqual(letzte.datei, { name: "aufnahme.webm", typ: "audio/webm", groesse: audio.length });
});

test("Fehler des Dienstes wird zur verständlichen Meldung", async () => {
  antwortStatus = 500;
  await assert.rejects(verschrifte(audio), (error) => error instanceof SpracheFehler && error.status === 502 && /Fehler gemeldet \(500\)/.test(error.message));
  antwortStatus = 200;
});

test("Sitzung meldet die Server-Erkennung", async () => {
  const res = await fetch(`${basis}/api/sitzung`);
  assert.equal((await res.json()).spracheServer, true);
});

test("Endpunkt: nur angemeldet, leere Aufnahme abgelehnt, Audio wird zu Text", async () => {
  const ohne = await fetch(`${basis}/api/sprache`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: audio });
  assert.equal(ohne.status, 401);

  const leer = await fetch(`${basis}/api/sprache`, { method: "POST", headers: { "Content-Type": "audio/webm", Cookie: cookie }, body: Buffer.alloc(0) });
  assert.equal(leer.status, 400);

  const res = await fetch(`${basis}/api/sprache`, {
    method: "POST",
    headers: { "Content-Type": "audio/mp4", Cookie: cookie, "X-Vorher": encodeURIComponent("Die Kämmerei „prüft“.") },
    body: audio
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: "Der Antrag geht ein." });
  assert.equal(letzte.datei.name, "aufnahme.mp4");
  assert.equal(letzte.felder.prompt, "Verwaltung Die Kämmerei „prüft“.");
});

test("Ohne Whisper-Adresse meldet der Endpunkt, dass nichts eingerichtet ist", async () => {
  const gemerkt = config.whisper.baseUrl;
  config.whisper.baseUrl = "";
  try {
    const res = await fetch(`${basis}/api/sprache`, { method: "POST", headers: { "Content-Type": "audio/webm", Cookie: cookie }, body: audio });
    assert.equal(res.status, 503);
    const sitzung = await (await fetch(`${basis}/api/sitzung`)).json();
    assert.equal(sitzung.spracheServer, false);
  } finally {
    config.whisper.baseUrl = gemerkt;
  }
});
