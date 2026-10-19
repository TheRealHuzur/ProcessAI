// MCP-Schnittstelle für Claude Desktop: Zugang, Protokoll und alle Werkzeuge mit nachgebauter KI
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.APP_PASSWORD = "geheim";
process.env.MCP_TOKEN = "test-token";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const beispiel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "antrag-beispielmodell.json"), "utf8"));
const teilprozesse = fs.readFileSync(path.join(__dirname, "fixtures", "teilprozesse.bpmn"), "utf8");

const { erstelleApp } = await import("../server/index.js");
const { oeffneDatenbank } = await import("../server/db.js");
const { neuesModdle } = await import("../server/modell-lesen.js");

let server;
let basis;
let tmp;
// Antwort der nachgebauten KI, je Test austauschbar
let kiAntwort = beispiel;

async function mcp(body, { token = "test-token", kopf = "x-api-token" } = {}) {
  const res = await fetch(`${basis}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { [kopf]: kopf === "authorization" ? `Bearer ${token}` : token } : {}) },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

let naechsteId = 1;
async function rufe(name, args = {}) {
  const { status, json } = await mcp({ jsonrpc: "2.0", id: naechsteId++, method: "tools/call", params: { name, arguments: args } });
  assert.equal(status, 200);
  const text = json.result.content[0].text;
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    daten = text;
  }
  return { fehler: json.result.isError, daten };
}

async function lagen(xml) {
  const { rootElement } = await neuesModdle().fromXML(xml);
  const lage = {};
  for (const form of rootElement.diagrams[0].plane.planeElement) {
    if (form.bounds) lage[form.bpmnElement.id] = [form.bounds.x, form.bounds.y, form.bounds.width, form.bounds.height];
  }
  return lage;
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pp-mcp-"));
  const db = oeffneDatenbank(tmp);
  const app = erstelleApp({ db, llm: async () => ({ content: JSON.stringify(kiAntwort) }) });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  basis = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Zugang nur mit Token, über x-api-token oder Bearer", async () => {
  const init = { jsonrpc: "2.0", id: 1, method: "ping" };
  assert.equal((await mcp(init, { token: "" })).status, 401);
  assert.equal((await mcp(init, { token: "falsch" })).status, 401);
  assert.equal((await mcp(init)).status, 200);
  assert.equal((await mcp(init, { kopf: "authorization" })).status, 200);
  const get = await fetch(`${basis}/api/mcp`, { headers: { "x-api-token": "test-token" } });
  assert.equal(get.status, 405);
});

test("Initialisierung, Benachrichtigung und Werkzeugliste", async () => {
  const init = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  assert.equal(init.json.result.protocolVersion, "2025-06-18");
  assert.equal(init.json.result.serverInfo.name, "prozesspilot");
  assert.ok(init.json.result.capabilities.tools);
  assert.match(init.json.result.instructions, /Rollen statt Personennamen/);

  const unbekannt = await mcp({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(unbekannt.json.result.protocolVersion, "2025-11-25");

  const benachrichtigung = await mcp({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(benachrichtigung.status, 202);

  const { json } = await mcp({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  const namen = json.result.tools.map((t) => t.name);
  for (const name of ["anleitung_lesen", "prozesse_auflisten", "prozess_lesen", "prozess_erzeugen", "prozess_aendern", "modell_speichern", "arbeitshilfen_setzen", "bpmn_xml_speichern", "version_wiederherstellen", "prozess_loeschen", "handbuch_link", "ki_modelle_auflisten"]) {
    assert.ok(namen.includes(name), name);
  }
  for (const t of json.result.tools) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.run, undefined);
  }
  assert.equal(json.result.tools.find((t) => t.name === "prozess_loeschen").annotations.destructiveHint, true);

  const falsch = await mcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "gibt_es_nicht" } });
  assert.equal(falsch.json.error.code, -32602);
});

test("Anleitung enthält Format und Regelwerk", async () => {
  const { fehler, daten } = await rufe("anleitung_lesen");
  assert.equal(fehler, false);
  assert.match(daten, /modell_speichern/);
  assert.match(daten, /REGELWERK/);
});

test("Eigenes Modell prüfen, speichern, lesen; fehlende Arbeitshilfen bleiben", async () => {
  const geprueft = await rufe("modell_speichern", { modell: beispiel, nur_pruefen: true });
  assert.equal(geprueft.daten.gespeichert, false);
  assert.deepEqual(geprueft.daten.pruefung.fehler, []);
  assert.equal((await rufe("prozesse_auflisten")).daten.prozesse.length, 0);

  const neu = await rufe("modell_speichern", { modell: beispiel, name: "Antrag" });
  assert.equal(neu.fehler, false);
  assert.equal(neu.daten.version, 1);
  const id = neu.daten.prozess_id;

  const gelesen = await rufe("prozess_lesen", { prozess_id: id });
  assert.equal(gelesen.daten.name, "Antrag");
  assert.deepEqual(gelesen.daten.abweichungen, []);
  assert.deepEqual(gelesen.daten.modell.unklarheiten, beispiel.unklarheiten);
  assert.deepEqual(gelesen.daten.pruefung.fehler, []);
  const bescheid = gelesen.daten.modell.elemente.find((e) => e.id === "Task_BescheidErstellen");
  assert.equal(bescheid.beschreibung, "Vorlage aus dem Fachverfahren verwenden.");
  assert.equal(gelesen.daten.bpmn_xml, undefined);

  // Claude schickt das Modell ohne beschreibung zurück und benennt einen Schritt um
  const ohne = {
    ...gelesen.daten.modell,
    elemente: gelesen.daten.modell.elemente.map(({ beschreibung, ...e }) => (e.id === "Task_AntragPruefen" ? { ...e, name: "Antrag gründlich prüfen" } : e))
  };
  const zweite = await rufe("modell_speichern", { modell: ohne, prozess_id: id, notiz: "umbenannt" });
  assert.equal(zweite.daten.version, 2);
  assert.deepEqual(zweite.daten.aenderung.geaendert, ["Task_AntragPruefen"]);
  const wieder = await rufe("prozess_lesen", { prozess_id: id, mit_xml: true });
  assert.equal(wieder.daten.modell.elemente.find((e) => e.id === "Task_BescheidErstellen").beschreibung, "Vorlage aus dem Fachverfahren verwenden.");
  assert.equal(wieder.daten.notiz, "umbenannt");
  assert.equal(wieder.daten.ki_modell, "claude-desktop");
  assert.ok(wieder.daten.bpmn_xml.includes("Antrag gründlich prüfen"));
  assert.equal(wieder.daten.versionen.length, 2);

  // Ein leerer Wert löscht bewusst
  const geloescht = { ...ohne, elemente: ohne.elemente.map((e) => (e.id === "Task_BescheidErstellen" ? { ...e, beschreibung: "" } : e)) };
  await rufe("modell_speichern", { modell: geloescht, prozess_id: id });
  const leer = await rufe("prozess_lesen", { prozess_id: id });
  assert.equal(leer.daten.modell.elemente.find((e) => e.id === "Task_BescheidErstellen").beschreibung, "");

  const alt = await rufe("prozess_lesen", { prozess_id: id, version: 1 });
  assert.equal(alt.daten.version, 1);
  assert.equal(alt.daten.neueste_version, 3);
});

test("Modell mit Regelverstoß wird gemeldet, kaputtes Modell abgelehnt", async () => {
  const falsch = { ...beispiel, fluesse: beispiel.fluesse.filter((f) => f.von !== "Task_AntragErfassen") };
  const { daten } = await rufe("modell_speichern", { modell: falsch, nur_pruefen: true });
  assert.ok(daten.pruefung.fehler.length > 0);
  const kaputt = await rufe("modell_speichern", { modell: "kein json" });
  assert.equal(kaputt.fehler, true);
  const leer = await rufe("modell_speichern", { modell: { elemente: [] } });
  assert.equal(leer.fehler, true);
});

test("Arbeitshilfen setzen ändert nur die Angaben, nicht die Anordnung", async () => {
  const { daten: neu } = await rufe("modell_speichern", { modell: beispiel });
  const id = neu.prozess_id;
  const vorher = await rufe("prozess_lesen", { prozess_id: id, mit_xml: true });

  const gesetzt = await rufe("arbeitshilfen_setzen", {
    prozess_id: id,
    eintraege: [
      { element_id: "Task_AntragPruefen", arbeitshilfe: "Vollständigkeit nach Checkliste prüfen.", dokumente: ["Checkliste Antrag"], rechtsgrundlagen: ["§ 1 Satzung"] },
      { element_id: "Start_AntragEingegangen", arbeitshilfe: "Eingang im Fachverfahren erfassen." }
    ]
  });
  assert.equal(gesetzt.fehler, false);
  assert.equal(gesetzt.daten.version, 2);

  const nachher = await rufe("prozess_lesen", { prozess_id: id, mit_xml: true });
  const pruefen = nachher.daten.modell.elemente.find((e) => e.id === "Task_AntragPruefen");
  assert.equal(pruefen.beschreibung, "Vollständigkeit nach Checkliste prüfen.");
  assert.deepEqual(pruefen.wissen, { dokumente: ["Checkliste Antrag"], ansprechpersonen: [], rechtsgrundlagen: ["§ 1 Satzung"] });
  assert.equal(nachher.daten.modell.elemente.find((e) => e.id === "Start_AntragEingegangen").beschreibung, "Eingang im Fachverfahren erfassen.");
  assert.equal(nachher.daten.modell.elemente.find((e) => e.id === "Task_BescheidErstellen").beschreibung, "Vorlage aus dem Fachverfahren verwenden.");
  assert.deepEqual(await lagen(nachher.daten.bpmn_xml), await lagen(vorher.daten.bpmn_xml));
  assert.deepEqual(nachher.daten.modell.unklarheiten, beispiel.unklarheiten);

  // Nur übergebene Felder ändern sich
  await rufe("arbeitshilfen_setzen", { prozess_id: id, eintraege: [{ element_id: "Task_AntragPruefen", ansprechpersonen: ["Kassenleitung"] }] });
  const dritte = await rufe("prozess_lesen", { prozess_id: id });
  const wieder = dritte.daten.modell.elemente.find((e) => e.id === "Task_AntragPruefen");
  assert.equal(wieder.beschreibung, "Vollständigkeit nach Checkliste prüfen.");
  assert.deepEqual(wieder.wissen, { dokumente: ["Checkliste Antrag"], ansprechpersonen: ["Kassenleitung"], rechtsgrundlagen: ["§ 1 Satzung"] });

  // Unbekanntes Element oder Angaben an einem Gateway: nichts wird gespeichert
  const unbekannt = await rufe("arbeitshilfen_setzen", { prozess_id: id, eintraege: [{ element_id: "Task_AntragPruefen", arbeitshilfe: "x" }, { element_id: "Gibt_Es_Nicht", arbeitshilfe: "y" }] });
  assert.equal(unbekannt.fehler, true);
  const gateway = await rufe("arbeitshilfen_setzen", { prozess_id: id, eintraege: [{ element_id: "Gateway_Vollstaendig", dokumente: ["x"] }] });
  assert.equal(gateway.fehler, true);
  assert.equal((await rufe("prozess_lesen", { prozess_id: id })).daten.version, 3);
});

test("Erzeugen und Ändern über die KI der App", async () => {
  kiAntwort = beispiel;
  const zukurz = await rufe("prozess_erzeugen", { text: "kurz" });
  assert.equal(zukurz.fehler, true);
  const fremd = await rufe("prozess_erzeugen", { text: "Ein Antrag geht ein und wird von der Poststelle erfasst.", ki_modell: "gibt/es-nicht" });
  assert.equal(fremd.fehler, true);

  const erzeugt = await rufe("prozess_erzeugen", { text: "Ein Antrag geht ein und wird von der Poststelle erfasst.", prozessname: "Antrag KI" });
  assert.equal(erzeugt.fehler, false);
  assert.equal(erzeugt.daten.version, 1);
  assert.equal(erzeugt.daten.unklarheiten.length, 1);
  const id = erzeugt.daten.prozess_id;
  const gelesen = await rufe("prozess_lesen", { prozess_id: id });
  assert.equal(gelesen.daten.ursprungstext, "Ein Antrag geht ein und wird von der Poststelle erfasst.");
  assert.equal(gelesen.daten.name, "Antrag KI");

  // KI ändert nichts und fragt zurück: keine neue Version
  kiAntwort = { ...beispiel, rueckfrage: "Welcher Schritt ist gemeint?" };
  const rueck = await rufe("prozess_aendern", { prozess_id: id, anweisung: "Mach das anders." });
  assert.equal(rueck.daten.gespeichert, false);
  assert.equal(rueck.daten.rueckfrage, "Welcher Schritt ist gemeint?");

  // KI benennt einen Schritt um: neue Version, Arbeitshilfe bleibt
  kiAntwort = {
    ...beispiel,
    elemente: beispiel.elemente.map(({ beschreibung, ...e }) => (e.id === "Task_AntragErfassen" ? { ...e, name: "Antrag digital erfassen" } : e)),
    aenderungen: ["Schritt umbenannt"]
  };
  const geaendert = await rufe("prozess_aendern", { prozess_id: id, anweisung: "Benenne das um.", element_id: "Task_AntragErfassen" });
  assert.equal(geaendert.daten.gespeichert, true);
  assert.equal(geaendert.daten.version, 2);
  assert.deepEqual(geaendert.daten.aenderung.geaendert, ["Task_AntragErfassen"]);
  assert.deepEqual(geaendert.daten.aenderungen, ["Schritt umbenannt"]);
  const nachher = await rufe("prozess_lesen", { prozess_id: id });
  assert.equal(nachher.daten.modell.elemente.find((e) => e.id === "Task_BescheidErstellen").beschreibung, "Vorlage aus dem Fachverfahren verwenden.");

  const falschesElement = await rufe("prozess_aendern", { prozess_id: id, anweisung: "Benenne das um.", element_id: "Gibt_Es_Nicht" });
  assert.equal(falschesElement.fehler, true);
  kiAntwort = beispiel;
});

test("Fremdes XML speichern, Verluste beim Neuaufbau nur mit Zustimmung", async () => {
  const kaputt = await rufe("bpmn_xml_speichern", { bpmn_xml: "kein XML" });
  assert.equal(kaputt.fehler, true);

  const { daten } = await rufe("bpmn_xml_speichern", { bpmn_xml: teilprozesse, name: "Mit Teilprozessen" });
  assert.ok(daten.abweichungen.length > 0);
  const id = daten.prozess_id;

  const gelesen = await rufe("prozess_lesen", { prozess_id: id });
  const ohne = await rufe("modell_speichern", { modell: gelesen.daten.modell, prozess_id: id });
  assert.equal(ohne.fehler, true);
  assert.match(ohne.daten, /verluste_akzeptieren/);
  const aendern = await rufe("prozess_aendern", { prozess_id: id, anweisung: "Benenne etwas um." });
  assert.equal(aendern.fehler, true);

  const mit = await rufe("modell_speichern", { modell: gelesen.daten.modell, prozess_id: id, verluste_akzeptieren: true });
  assert.equal(mit.fehler, false);
  assert.equal(mit.daten.version, 2);

  // Arbeitshilfe im aufgeklappten Teilprozess der ersten Version, ohne Neuaufbau
  await rufe("version_wiederherstellen", { prozess_id: id, version: 1 });
  const gesetzt = await rufe("arbeitshilfen_setzen", { prozess_id: id, eintraege: [{ element_id: "Task_Buchen", arbeitshilfe: "Im Kassenverfahren buchen." }] });
  assert.equal(gesetzt.fehler, false);
  const stand = await rufe("prozess_lesen", { prozess_id: id, mit_xml: true });
  assert.ok(stand.daten.bpmn_xml.includes("Im Kassenverfahren buchen."));
  assert.ok(stand.daten.bpmn_xml.includes('id="Sub_Start"'));
});

test("Version wiederherstellen, Handbuch-Link, Löschen", async () => {
  const { daten: neu } = await rufe("modell_speichern", { modell: beispiel, name: "Zum Löschen" });
  const id = neu.prozess_id;
  await rufe("arbeitshilfen_setzen", { prozess_id: id, eintraege: [{ element_id: "Task_AntragPruefen", arbeitshilfe: "Neu." }] });

  const wieder = await rufe("version_wiederherstellen", { prozess_id: id, version: 1 });
  assert.equal(wieder.daten.version, 3);
  const v1 = await rufe("prozess_lesen", { prozess_id: id, version: 1, mit_xml: true });
  const v3 = await rufe("prozess_lesen", { prozess_id: id, version: 3, mit_xml: true });
  assert.equal(v3.daten.bpmn_xml, v1.daten.bpmn_xml);
  assert.equal((await rufe("version_wiederherstellen", { prozess_id: id, version: 9 })).fehler, true);

  const { daten: link } = await rufe("handbuch_link", { prozess_id: id });
  assert.equal(link.version, 3);
  const url = new URL(link.link);
  const pdf = await fetch(`${basis}${url.pathname}${url.search}`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  const gefaelscht = await fetch(`${basis}${url.pathname.replace(/\/3$/, "/1")}${url.search}`);
  assert.equal(gefaelscht.status, 403);
  const abgelaufen = await fetch(`${basis}${url.pathname}?bis=1&sig=${url.searchParams.get("sig")}`);
  assert.equal(abgelaufen.status, 403);

  const geloescht = await rufe("prozess_loeschen", { prozess_id: id });
  assert.equal(geloescht.daten.geloescht, true);
  assert.equal(geloescht.daten.versionen, 3);
  assert.equal((await rufe("prozess_lesen", { prozess_id: id })).fehler, true);
  assert.equal((await rufe("prozess_loeschen", { prozess_id: id })).fehler, true);
});
