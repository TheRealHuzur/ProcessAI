// Phase 8: zwei Konten, Kommentare und Vorschläge am Schritt, Chatbot mit eigener Seite
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.APP_PASSWORD = "geheim";
process.env.KONTO1_NAME = "Patrick";
process.env.KONTO2_PASSWORT = "zweites-geheim";
process.env.KONTO2_NAME = "Kollegin";
process.env.SESSION_SECRET = "test-secret";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xml = fs.readFileSync(path.join(__dirname, "fixtures", "teilprozesse.bpmn"), "utf8");

const { erstelleApp } = await import("../server/index.js");
const { oeffneDatenbank } = await import("../server/db.js");
const { wissenAusXml } = await import("../server/chat.js");

let server;
let basis;
let tmp;
let prozessId;
// Letzte Anfrage an die KI-Attrappe und ihre nächste Antwort
const ki = { messages: null, antwort: "{}" };
const cookies = {};

async function api(konto, pfad, { method = "GET", body } = {}) {
  const res = await fetch(`${basis}${pfad}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookies[konto] ? { Cookie: cookies[konto] } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookies[konto] = setCookie.split(";")[0];
  return { status: res.status, json: await res.json() };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pp-"));
  const db = oeffneDatenbank(tmp);
  const app = erstelleApp({
    db,
    llm: async ({ messages }) => {
      ki.messages = messages;
      return { content: ki.antwort };
    }
  });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  basis = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Zwei Konten: das Passwort bestimmt das Konto", async () => {
  const eins = await api("patrick", "/api/anmelden", { method: "POST", body: { passwort: "geheim" } });
  assert.equal(eins.status, 200);
  assert.equal(eins.json.konto, "Patrick");
  const zwei = await api("kollegin", "/api/anmelden", { method: "POST", body: { passwort: "zweites-geheim" } });
  assert.equal(zwei.status, 200);
  assert.equal(zwei.json.konto, "Kollegin");
  assert.equal((await api("kollegin", "/api/sitzung")).json.konto, "Kollegin");
  assert.equal((await api("patrick", "/api/sitzung")).json.konto, "Patrick");
  assert.equal((await api("kollegin", "/api/prozesse")).status, 200);
});

test("Sitzungen von vor den Konten gelten als Hauptkonto", async () => {
  const ablauf = String(Date.now() + 60000);
  const signatur = crypto.createHmac("sha256", "test-secret").update(ablauf).digest("base64url");
  cookies.alt = `pp_sitzung=${encodeURIComponent(`${ablauf}.${signatur}`)}`;
  const { json } = await api("alt", "/api/sitzung");
  assert.equal(json.angemeldet, true);
  assert.equal(json.konto, "Patrick");
  cookies.gefaelscht = `pp_sitzung=${encodeURIComponent(`konto2.${ablauf}.${signatur}`)}`;
  assert.equal((await api("gefaelscht", "/api/sitzung")).json.angemeldet, false);
});

test("Die Chat-Seite gibt es nur nach Anmeldung", async () => {
  const ohne = await fetch(`${basis}/chat/`, { redirect: "manual" });
  assert.equal(ohne.status, 302);
  assert.equal(ohne.headers.get("location"), "/?weiter=chat");
  const skript = await fetch(`${basis}/chat/chat.js`, { redirect: "manual" });
  assert.equal(skript.status, 302);
  const mit = await fetch(`${basis}/chat/`, { headers: { Cookie: cookies.kollegin } });
  assert.equal(mit.status, 200);
  assert.match(await mit.text(), /ProzessPilot Chat/);
});

test("Kommentar und Vorschlag am Schritt, Liste offener Einträge", async () => {
  const gespeichert = await api("patrick", "/api/prozesse", { method: "POST", body: { name: "Rechnung bezahlen", bpmnXml: xml } });
  prozessId = gespeichert.json.id;

  const vorschlag = await api("kollegin", `/api/prozesse/${prozessId}/kommentare`, {
    method: "POST",
    body: { elementId: "Task_Pruefen", art: "vorschlag", text: "Vorlage V3 liegt im Laufwerk Kasse." }
  });
  assert.equal(vorschlag.status, 200);
  assert.equal(vorschlag.json.verfasst_von, "Kollegin");
  assert.equal(vorschlag.json.element_name, "Rechnung prüfen");
  assert.equal(vorschlag.json.status, "offen");

  // Auch im Inneren eines Teilprozesses
  const kommentar = await api("kollegin", `/api/prozesse/${prozessId}/kommentare`, {
    method: "POST",
    body: { elementId: "Task_Buchen", art: "kommentar", text: "Welches Fachverfahren ist gemeint?" }
  });
  assert.equal(kommentar.status, 200);

  const unbekannt = await api("kollegin", `/api/prozesse/${prozessId}/kommentare`, { method: "POST", body: { elementId: "Task_Gibtsnicht", art: "kommentar", text: "x" } });
  assert.equal(unbekannt.status, 409);
  const ohneText = await api("kollegin", `/api/prozesse/${prozessId}/kommentare`, { method: "POST", body: { elementId: "Task_Pruefen", art: "kommentar", text: " " } });
  assert.equal(ohneText.status, 400);
  const falscheArt = await api("kollegin", `/api/prozesse/${prozessId}/kommentare`, { method: "POST", body: { elementId: "Task_Pruefen", art: "frage", text: "x" } });
  assert.equal(falscheArt.status, 400);

  const offen = await api("patrick", "/api/kommentare/offen");
  assert.equal(offen.json.length, 2);
  assert.deepEqual(offen.json.map((k) => k.prozess_name), ["Rechnung bezahlen", "Rechnung bezahlen"]);
  assert.equal((await api("patrick", `/api/prozesse/${prozessId}/kommentare`)).json.length, 2);
});

test("Übernommener Vorschlag landet in der Arbeitshilfe als neue Version", async () => {
  const [vorschlag, kommentar] = (await api("patrick", "/api/kommentare/offen")).json;

  const falsch = await api("patrick", `/api/kommentare/${kommentar.id}/entscheiden`, { method: "POST", body: { aktion: "uebernehmen" } });
  assert.equal(falsch.status, 400);

  const r = await api("patrick", `/api/kommentare/${vorschlag.id}/entscheiden`, {
    method: "POST",
    body: { aktion: "uebernehmen", text: "Vorlage V3 liegt im Laufwerk der Kasse." }
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.version, 2);
  assert.equal(r.json.kommentar.status, "uebernommen");
  assert.equal(r.json.kommentar.entschieden_von, "Patrick");
  assert.equal(r.json.kommentar.text, "Vorlage V3 liegt im Laufwerk der Kasse.");

  const prozess = (await api("patrick", `/api/prozesse/${prozessId}`)).json;
  assert.equal(prozess.aktuell.version, 2);
  assert.match(prozess.aktuell.bpmn_xml, /Sachlich und rechnerisch richtig zeichnen\.\n\nVorlage V3 liegt im Laufwerk der Kasse\./);
  // Weitere Angaben bleiben erhalten
  assert.match(prozess.aktuell.bpmn_xml, /§ 33 GemHVO/);
  assert.match(prozess.aktuell.notiz, /Vorschlag von Kollegin übernommen/);

  const nochmal = await api("patrick", `/api/kommentare/${vorschlag.id}/entscheiden`, { method: "POST", body: { aktion: "ablehnen" } });
  assert.equal(nochmal.status, 409);

  const erledigt = await api("kollegin", `/api/kommentare/${kommentar.id}/entscheiden`, { method: "POST", body: { aktion: "erledigt" } });
  assert.equal(erledigt.status, 200);
  assert.equal(erledigt.json.version, null);
  assert.equal(erledigt.json.kommentar.status, "erledigt");
  assert.equal((await api("patrick", "/api/kommentare/offen")).json.length, 0);
});

test("Wissen für den Chat kommt auch aus Teilprozessen", async () => {
  const { wissen, elemente } = await wissenAusXml(xml);
  const buchen = wissen.schritte.find((s) => s.id === "Task_Buchen");
  assert.equal(buchen.im_teilprozess, "Zahlung\nausführen");
  assert.match(buchen.arbeitshilfe, /Belegnummer/);
  const pruefen = wissen.schritte.find((s) => s.id === "Task_Pruefen");
  assert.equal(pruefen.rolle, "Sachbearbeitung");
  assert.equal(pruefen.pool, "Stadtkasse");
  assert.deepEqual(pruefen.rechtsgrundlagen, ["§ 33 GemHVO"]);
  assert.deepEqual(pruefen.danach, ["Zahlung freigeben"]);
  assert.equal(elemente.get("Rolle_Kassenleitung").typ, "Rolle");
});

test("Chat antwortet aus dem Wissen und nennt nur echte Fundstellen", async () => {
  ki.antwort = JSON.stringify({ antwort: "Die Sachbearbeitung prüft die Rechnung.", beantwortet: true, fundstellen: ["Task_Pruefen", "Task_Erfunden", "Rolle_Sachbearbeitung", "Task_Pruefen"] });
  const r = await api("kollegin", "/api/chat", {
    method: "POST",
    body: { prozessId, frage: "Wer prüft die Rechnung?", verlauf: [{ frage: "Worum geht es?", antwort: "Um das Bezahlen von Rechnungen." }] }
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.antwort, "Die Sachbearbeitung prüft die Rechnung.");
  assert.equal(r.json.beantwortet, true);
  assert.deepEqual(r.json.fundstellen.map((f) => f.id), ["Task_Pruefen", "Rolle_Sachbearbeitung"]);
  assert.equal(r.json.fundstellen[0].name, "Rechnung prüfen");
  assert.equal(r.json.prozess.version, 2);

  // Wissen der neuesten Version im Systemprompt, Verlauf davor, Frage zuletzt
  assert.equal(ki.messages[0].role, "system");
  assert.match(ki.messages[0].content, /Laufwerk der Kasse/);
  assert.deepEqual(ki.messages.slice(1).map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(ki.messages.at(-1).content, "Wer prüft die Rechnung?");
});

test("Chat meldet fehlendes Wissen und prüft die Eingaben", async () => {
  ki.antwort = JSON.stringify({ antwort: "Dazu steht nichts im hinterlegten Wissen.", beantwortet: false, fundstellen: [] });
  const r = await api("kollegin", "/api/chat", { method: "POST", body: { prozessId, frage: "Wie lange dauert das?" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.beantwortet, false);
  assert.deepEqual(r.json.fundstellen, []);

  assert.equal((await api("kollegin", "/api/chat", { method: "POST", body: { prozessId, frage: "?" } })).status, 400);
  assert.equal((await api("kollegin", "/api/chat", { method: "POST", body: { prozessId: "gibtsnicht", frage: "Wer prüft?" } })).status, 404);
  assert.equal((await api("niemand", "/api/chat", { method: "POST", body: { prozessId, frage: "Wer prüft?" } })).status, 401);

  const modelle = await api("kollegin", "/api/chat/modelle");
  assert.deepEqual(modelle.json.map((m) => m.id), ["deepseek/deepseek-v4-flash-20260423"]);
});
