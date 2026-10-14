import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.APP_PASSWORD = "geheim";
process.env.SESSION_SECRET = "test-secret";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const beispiel = fs.readFileSync(path.join(__dirname, "..", "examples", "antrag-beispielmodell.json"), "utf8");

const { erstelleApp } = await import("../server/index.js");
const { oeffneDatenbank } = await import("../server/db.js");

let server;
let basis;
let cookie = "";
let tmp;

async function api(pfad, { method = "GET", body } = {}) {
  const res = await fetch(`${basis}${pfad}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: res.status, json: await res.json() };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pp-"));
  const db = oeffneDatenbank(tmp);
  const app = erstelleApp({ db, llm: async () => ({ content: beispiel }) });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  basis = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Ohne Anmeldung ist die Schnittstelle gesperrt", async () => {
  const { status } = await api("/api/prozesse");
  assert.equal(status, 401);
});

test("Falsches Passwort wird abgelehnt", async () => {
  const { status } = await api("/api/anmelden", { method: "POST", body: { passwort: "falsch" } });
  assert.equal(status, 401);
});

test("Anmelden, erzeugen, speichern, laden", async () => {
  const login = await api("/api/anmelden", { method: "POST", body: { passwort: "geheim" } });
  assert.equal(login.status, 200);

  const modelle = await api("/api/modelle");
  assert.ok(modelle.json.length >= 2);

  const erzeugt = await api("/api/erzeugen", { method: "POST", body: { text: "Ein Antrag geht ein und wird von der Poststelle erfasst.", prozessname: "Antrag", modell: modelle.json[0].id } });
  assert.equal(erzeugt.status, 200);
  assert.ok(erzeugt.json.xml.includes("bpmn:definitions"));
  assert.deepEqual(erzeugt.json.pruefung.fehler, []);
  assert.equal(erzeugt.json.unklarheiten.length, 1);

  const gespeichert = await api("/api/prozesse", { method: "POST", body: { name: "Antrag", bpmnXml: erzeugt.json.xml, quelltext: "Text", kiModell: erzeugt.json.modell } });
  assert.equal(gespeichert.status, 200);
  assert.equal(gespeichert.json.version, 1);

  const zweite = await api("/api/prozesse", { method: "POST", body: { prozessId: gespeichert.json.id, name: "Antrag", bpmnXml: erzeugt.json.xml } });
  assert.equal(zweite.json.version, 2);
  assert.equal(zweite.json.id, gespeichert.json.id);

  const liste = await api("/api/prozesse");
  assert.equal(liste.json.length, 1);
  assert.equal(liste.json[0].version, 2);

  const geladen = await api(`/api/prozesse/${gespeichert.json.id}`);
  assert.equal(geladen.json.aktuell.version, 2);
  assert.equal(geladen.json.versionen.length, 2);
});
