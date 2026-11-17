// Arbeitsbereiche: Migration vorhandener Prozesse, Schnittstelle im Browser und über MCP
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

process.env.APP_PASSWORD = "geheim";
process.env.MCP_TOKEN = "test-token";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xml = fs.readFileSync(path.join(__dirname, "fixtures", "teilprozesse.bpmn"), "utf8");

const { erstelleApp } = await import("../server/index.js");
const { oeffneDatenbank, MIGRATIONEN, STANDARD_BEREICH } = await import("../server/db.js");

let server;
let basis;
let tmp;
let cookie = "";

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

let naechsteId = 1;
async function rufe(name, args = {}) {
  const res = await fetch(`${basis}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "x-api-token": "test-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: naechsteId++, method: "tools/call", params: { name, arguments: args } })
  });
  const json = await res.json();
  const text = json.result.content[0].text;
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    daten = text;
  }
  return { fehler: json.result.isError, daten };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pp-bereiche-"));
  // Datenbank im Stand vor den Arbeitsbereichen mit einem vorhandenen Prozess
  const alt = new DatabaseSync(path.join(tmp, "prozesspilot.db"));
  alt.exec(MIGRATIONEN[0]);
  alt.exec(MIGRATIONEN[1]);
  alt.exec("PRAGMA user_version = 2");
  alt.prepare("INSERT INTO prozesse (id, name, erstellt, geaendert) VALUES ('alt-1', 'Alter Prozess', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')").run();
  alt.close();

  const db = oeffneDatenbank(tmp);
  const app = erstelleApp({ db, llm: async () => ({ content: "{}" }) });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  basis = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await api("/api/anmelden", { method: "POST", body: { passwort: "geheim" } })).status, 200);
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Migration legt Allgemein an und ordnet vorhandene Prozesse dort ein", async () => {
  const bereiche = (await api("/api/arbeitsbereiche")).json;
  assert.deepEqual(bereiche.map((b) => [b.id, b.name, b.prozesse]), [[STANDARD_BEREICH, "Allgemein", 1]]);
  const [prozess] = (await api("/api/prozesse")).json;
  assert.equal(prozess.arbeitsbereich_id, STANDARD_BEREICH);
  assert.equal(prozess.arbeitsbereich, "Allgemein");
});

test("Arbeitsbereiche nur angemeldet", async () => {
  const res = await fetch(`${basis}/api/arbeitsbereiche`);
  assert.equal(res.status, 401);
});

test("Bereich anlegen und umbenennen, Namen eindeutig", async () => {
  const neu = await api("/api/arbeitsbereiche", { method: "POST", body: { name: "  Seminare   intern " } });
  assert.equal(neu.status, 200);
  assert.equal(neu.json.name, "Seminare intern");
  assert.equal((await api("/api/arbeitsbereiche", { method: "POST", body: { name: "seminare INTERN" } })).status, 409);
  assert.equal((await api("/api/arbeitsbereiche", { method: "POST", body: { name: " " } })).status, 400);
  assert.equal((await api("/api/arbeitsbereiche", { method: "POST", body: { name: "x".repeat(61) } })).status, 400);

  const umbenannt = await api(`/api/arbeitsbereiche/${neu.json.id}`, { method: "PATCH", body: { name: "Seminare" } });
  assert.equal(umbenannt.json.name, "Seminare");
  // Nur andere Schreibweise des eigenen Namens ist erlaubt
  assert.equal((await api(`/api/arbeitsbereiche/${neu.json.id}`, { method: "PATCH", body: { name: "SEMINARE" } })).status, 200);
  assert.equal((await api(`/api/arbeitsbereiche/${neu.json.id}`, { method: "PATCH", body: { name: "allgemein" } })).status, 409);
  assert.equal((await api("/api/arbeitsbereiche/gibts-nicht", { method: "PATCH", body: { name: "Neu" } })).status, 404);
});

test("Neue Prozesse landen im gewählten Bereich, Speichern verschiebt nicht", async () => {
  const bereich = (await api("/api/arbeitsbereiche", { method: "POST", body: { name: "Kasse" } })).json;
  const neu = await api("/api/prozesse", { method: "POST", body: { name: "Rechnung bezahlen", bpmnXml: xml, arbeitsbereichId: bereich.id } });
  assert.equal(neu.status, 200);
  assert.equal((await api(`/api/prozesse/${neu.json.id}`)).json.arbeitsbereich_id, bereich.id);

  // Neue Version mit anderem Bereich: bleibt, wo er ist
  await api("/api/prozesse", { method: "POST", body: { prozessId: neu.json.id, name: "Rechnung bezahlen", bpmnXml: xml, arbeitsbereichId: STANDARD_BEREICH } });
  assert.equal((await api(`/api/prozesse/${neu.json.id}`)).json.arbeitsbereich_id, bereich.id);

  const ohne = await api("/api/prozesse", { method: "POST", body: { name: "Ohne Angabe", bpmnXml: xml } });
  assert.equal((await api(`/api/prozesse/${ohne.json.id}`)).json.arbeitsbereich_id, STANDARD_BEREICH);
  assert.equal((await api("/api/prozesse", { method: "POST", body: { name: "X", bpmnXml: xml, arbeitsbereichId: "gibts-nicht" } })).status, 400);

  const kasse = (await api(`/api/prozesse?arbeitsbereich=${bereich.id}`)).json;
  assert.deepEqual(kasse.map((p) => p.name), ["Rechnung bezahlen"]);
  const alle = (await api("/api/prozesse")).json;
  assert.ok(alle.length >= 3);
});

test("Prozess verschieben, Vorschlagsliste je Bereich", async () => {
  const bereich = (await api("/api/arbeitsbereiche", { method: "POST", body: { name: "Personal" } })).json;
  const neu = (await api("/api/prozesse", { method: "POST", body: { name: "Urlaub beantragen", bpmnXml: xml } })).json;
  await api(`/api/prozesse/${neu.id}/kommentare`, { method: "POST", body: { elementId: "Task_Pruefen", art: "kommentar", text: "Wer vertritt?" } });

  const vorher = (await api(`/api/kommentare/offen?arbeitsbereich=${STANDARD_BEREICH}`)).json;
  assert.ok(vorher.some((k) => k.prozess_id === neu.id));
  assert.equal((await api(`/api/kommentare/offen?arbeitsbereich=${bereich.id}`)).json.length, 0);

  const geaendertVorher = (await api(`/api/prozesse/${neu.id}`)).json.geaendert;
  const verschoben = await api(`/api/prozesse/${neu.id}`, { method: "PATCH", body: { arbeitsbereichId: bereich.id } });
  assert.equal(verschoben.status, 200);
  const nachher = (await api(`/api/prozesse/${neu.id}`)).json;
  assert.equal(nachher.arbeitsbereich_id, bereich.id);
  assert.equal(nachher.geaendert, geaendertVorher);
  assert.equal(nachher.versionen.length, 1);

  assert.equal((await api(`/api/kommentare/offen?arbeitsbereich=${bereich.id}`)).json.length, 1);
  assert.ok(!(await api(`/api/kommentare/offen?arbeitsbereich=${STANDARD_BEREICH}`)).json.some((k) => k.prozess_id === neu.id));
  assert.ok((await api("/api/kommentare/offen")).json.some((k) => k.prozess_id === neu.id));

  assert.equal((await api(`/api/prozesse/${neu.id}`, { method: "PATCH", body: { arbeitsbereichId: "gibts-nicht" } })).status, 400);
  assert.equal((await api("/api/prozesse/gibts-nicht", { method: "PATCH", body: { arbeitsbereichId: bereich.id } })).status, 404);
});

test("MCP: Bereiche auflisten, Prozesse filtern, Bereich beim Anlegen", async () => {
  const { daten } = await rufe("arbeitsbereiche_auflisten");
  const personal = daten.arbeitsbereiche.find((b) => b.name === "Personal");
  assert.ok(personal);

  const gefiltert = await rufe("prozesse_auflisten", { arbeitsbereich_id: personal.id });
  assert.deepEqual(gefiltert.daten.prozesse.map((p) => p.name), ["Urlaub beantragen"]);
  assert.equal(gefiltert.daten.prozesse[0].arbeitsbereich, "Personal");
  const falsch = await rufe("prozesse_auflisten", { arbeitsbereich_id: "gibts-nicht" });
  assert.equal(falsch.fehler, true);
  assert.match(falsch.daten, /arbeitsbereiche_auflisten/);

  const gespeichert = await rufe("bpmn_xml_speichern", { bpmn_xml: xml, name: "Von Claude", arbeitsbereich_id: personal.id });
  assert.equal(gespeichert.fehler, false);
  const gelesen = await rufe("prozess_lesen", { prozess_id: gespeichert.daten.prozess_id });
  assert.equal(gelesen.daten.arbeitsbereich_id, personal.id);
  assert.equal(gelesen.daten.arbeitsbereich, "Personal");

  const standard = await rufe("bpmn_xml_speichern", { bpmn_xml: xml, name: "Ohne Bereich" });
  assert.equal((await rufe("prozess_lesen", { prozess_id: standard.daten.prozess_id })).daten.arbeitsbereich_id, STANDARD_BEREICH);
  const unbekannt = await rufe("bpmn_xml_speichern", { bpmn_xml: xml, arbeitsbereich_id: "gibts-nicht" });
  assert.equal(unbekannt.fehler, true);
});
