import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BpmnModdle from "bpmn-moddle";
import { bauenAusJson, zuXml, erzeugeModell } from "../server/pipeline.js";
import { pruefeModell } from "../server/regelcheck.js";
import { normalisiereModell } from "../server/modell.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const beispiel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "antrag-beispielmodell.json"), "utf8"));

async function parseXml(xml) {
  const moddle = new BpmnModdle();
  return moddle.fromXML(xml);
}

test("Beispielmodell besteht den Regelcheck ohne Fehler", () => {
  const { probleme, pruefung } = bauenAusJson(beispiel);
  assert.deepEqual(probleme, []);
  assert.deepEqual(pruefung.fehler, []);
});

test("Erzeugtes BPMN-XML ist gültig, vollständig und hat Diagramm-Informationen", async () => {
  const { modell } = bauenAusJson(beispiel);
  const xml = zuXml(modell);
  const { rootElement, warnings, elementsById } = await parseXml(xml);
  assert.deepEqual(warnings, [], `Warnungen: ${warnings.map((w) => w.message).join("; ")}`);

  const prozess = rootElement.rootElements.find((e) => e.$type === "bpmn:Process");
  const collaboration = rootElement.rootElements.find((e) => e.$type === "bpmn:Collaboration");
  assert.ok(prozess && collaboration);
  assert.equal(collaboration.participants.length, 2);
  assert.equal(collaboration.messageFlows.length, 4);
  assert.equal(prozess.laneSets[0].lanes.length, 2);

  // Feste IDs bleiben erhalten
  assert.ok(elementsById.Task_AntragPruefen);
  assert.equal(elementsById.Task_AntragPruefen.$type, "bpmn:Task");
  assert.equal(elementsById.Gateway_Warten.$type, "bpmn:EventBasedGateway");
  assert.equal(elementsById.Event_FristAbgelaufen.eventDefinitions[0].$type, "bpmn:TimerEventDefinition");
  assert.equal(elementsById.Task_BescheidErstellen.documentation[0].text, "Vorlage aus dem Fachverfahren verwenden.");

  // Jedes Element und jeder Fluss hat eine Form im Diagramm
  const plane = rootElement.diagrams[0].plane;
  const imDiagramm = new Set(plane.planeElement.map((d) => d.bpmnElement && d.bpmnElement.id));
  for (const element of prozess.flowElements) {
    if (element.$type === "bpmn:DataObject") continue;
    assert.ok(imDiagramm.has(element.id), `Kein Diagrammelement für ${element.id}`);
  }
  for (const flow of collaboration.messageFlows) {
    assert.ok(imDiagramm.has(flow.id), `Kein Diagrammelement für ${flow.id}`);
  }

  // XOR mit sichtbarem X
  const xorDi = plane.planeElement.find((d) => d.bpmnElement && d.bpmnElement.id === "Gateway_Vollstaendig");
  assert.equal(xorDi.isMarkerVisible, true);
});

test("Formen überlappen sich nicht", () => {
  const { modell } = bauenAusJson(beispiel);
  const xml = zuXml(modell);
  const boxen = [...xml.matchAll(/bpmnElement="([^"]+)"(?: [a-zA-Z]+="[^"]*")*><dc:Bounds x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)]
    .map((m) => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }))
    .filter((b) => !b.id.startsWith("Participant") && !b.id.startsWith("Rolle_") && !b.id.startsWith("Extern_"));
  for (let i = 0; i < boxen.length; i += 1) {
    for (let j = i + 1; j < boxen.length; j += 1) {
      const a = boxen[i];
      const b = boxen[j];
      const ueberlapp = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!ueberlapp, `${a.id} überlappt ${b.id}`);
    }
  }
});

test("Regelcheck findet Aufgabe mit zwei Ausgängen und Pfad ins Leere", () => {
  const roh = {
    rollen: [],
    elemente: [
      { id: "S", typ: "start", name: "Antrag ist eingegangen" },
      { id: "A", typ: "aufgabe", name: "Antrag prüfen" },
      { id: "B", typ: "aufgabe", name: "Bescheid erstellen" },
      { id: "C", typ: "aufgabe", name: "Akte anlegen" },
      { id: "E", typ: "ende", name: "Bescheid ist erstellt" }
    ],
    fluesse: [
      { von: "S", nach: "A" },
      { von: "A", nach: "B" },
      { von: "A", nach: "C" },
      { von: "B", nach: "E" }
    ]
  };
  const { modell } = normalisiereModell(roh);
  const { fehler } = pruefeModell(modell);
  assert.ok(fehler.some((f) => f.regel === "§8" && f.element === "A"));
  assert.ok(fehler.some((f) => f.regel === "§3" && f.element === "C"));
});

test("Nicht erlaubte Elementtypen werden gemeldet", () => {
  const { probleme } = normalisiereModell({ elemente: [{ id: "X", typ: "inclusiveGateway", name: "oder" }] });
  assert.equal(probleme.length, 1);
  assert.equal(probleme[0].regel, "§2");
});

test("Hinweise zu Benennung", () => {
  const roh = {
    elemente: [
      { id: "S", typ: "start", name: "Antrag entgegennehmen" },
      { id: "A", typ: "aufgabe", name: "Antragsprüfung" },
      { id: "E", typ: "ende", name: "Prozess beendet" }
    ],
    fluesse: [{ von: "S", nach: "A" }, { von: "A", nach: "E" }]
  };
  const { modell } = normalisiereModell(roh);
  const { fehler, hinweise } = pruefeModell(modell);
  assert.deepEqual(fehler, []);
  assert.ok(hinweise.some((h) => h.element === "S" && h.regel === "§4"));
  assert.ok(hinweise.some((h) => h.element === "A" && h.regel === "§8"));
  assert.ok(hinweise.some((h) => h.element === "E" && h.regel === "§7"));
});

test("Korrekturrunde: fehlerhafte erste Antwort wird korrigiert", async () => {
  const fehlerhaft = structuredClone(beispiel);
  fehlerhaft.fluesse = fehlerhaft.fluesse.filter((f) => f.id !== "Flow_12");
  const antworten = [JSON.stringify(fehlerhaft), "```json\n" + JSON.stringify(beispiel) + "\n```"];
  const gesendet = [];
  const llm = async ({ messages }) => {
    gesendet.push(messages.length);
    return { content: antworten.shift() };
  };
  const ergebnis = await erzeugeModell({ text: "Testtext", prozessname: "Test", model: { id: "test", provider: "openrouter" }, llm });
  assert.equal(ergebnis.korrigiert, true);
  assert.deepEqual(ergebnis.pruefung.fehler, []);
  assert.equal(gesendet.length, 2);
  assert.ok(ergebnis.xml.includes("Task_BescheidErstellen"));
});

test("Umlaute und Leerzeichen in IDs werden bereinigt, Verweise bleiben gültig", () => {
  const roh = {
    rollen: [{ id: "Rolle Bürgerbüro", name: "Bürgerbüro" }],
    elemente: [
      { id: "Start Anfrage", typ: "start", name: "Anfrage ist eingegangen", rolle: "Bürgerbüro" },
      { id: "Aufgabe prüfen", typ: "Task", name: "Anfrage prüfen", rolle: "Rolle Bürgerbüro" },
      { id: "Ende", typ: "EndEvent", name: "Anfrage ist beantwortet", rolle: "Rolle Bürgerbüro" }
    ],
    fluesse: [{ von: "Start Anfrage", nach: "Aufgabe prüfen" }, { von: "Aufgabe prüfen", nach: "Ende" }]
  };
  const { modell, probleme } = normalisiereModell(roh);
  assert.deepEqual(probleme, []);
  assert.equal(modell.elemente[1].id, "Aufgabe_prufen");
  assert.equal(modell.fluesse.length, 2);
  assert.equal(modell.elemente[0].rolle, modell.rollen[0].id);
});
