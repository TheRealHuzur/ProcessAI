// Ändern per Sprachbefehl: Modell aus dem Editor zurücklesen, KI-Änderung, Vergleich alt/neu
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import BpmnModdle from "bpmn-moddle";
import { bauenAusJson, zuXml, aendereModell, vergleicheModelle } from "../server/pipeline.js";
import { normalisiereModell } from "../server/modell.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lade = (...teile) => JSON.parse(fs.readFileSync(path.join(__dirname, ...teile), "utf8"));
const beispiel = lade("..", "examples", "antrag-beispielmodell.json");
const beschaffung = lade("fixtures", "beschaffung.json");

// Das Browser-Skript wie im Browser laden
const umgebung = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public", "modell-lesen.js"), "utf8"), umgebung);
// Ergebnis über JSON in diesen Kontext holen (Arrays aus dem vm-Kontext sind sonst ein anderer Realm)
const lesen = (definitions) => JSON.parse(JSON.stringify(umgebung.PPModellLesen.lesen(definitions)));

async function zurueckgelesen(roh) {
  const { modell } = bauenAusJson(roh);
  const { rootElement } = await new BpmnModdle().fromXML(zuXml(modell));
  const gelesen = lesen(rootElement);
  return { modell, gelesen };
}

for (const [name, roh] of [["Beispielmodell", beispiel], ["Beschaffungsprozess", beschaffung]]) {
  test(`${name}: Modell aus dem XML zurückgelesen ist dasselbe Modell`, async () => {
    const { modell, gelesen } = await zurueckgelesen(roh);
    assert.deepEqual(gelesen.abweichungen, []);
    const { modell: wieder, probleme } = normalisiereModell(gelesen.modell);
    assert.deepEqual(probleme, []);
    const vergleich = vergleicheModelle(modell, wieder);
    assert.ok(vergleich.unveraendert, JSON.stringify(vergleich));
    assert.deepEqual(wieder.elemente.map((e) => e.beschreibung), modell.elemente.map((e) => e.beschreibung));
  });
}

test("Beschreibung (Arbeitshilfe) wird mitgelesen", async () => {
  const { gelesen } = await zurueckgelesen(beispiel);
  const bescheid = gelesen.modell.elemente.find((e) => e.id === "Task_BescheidErstellen");
  assert.equal(bescheid.beschreibung, "Vorlage aus dem Fachverfahren verwenden.");
});

test("Fremde Elemente werden angenähert oder als Verlust gemeldet", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x">
  <bpmn:process id="P" name="Fremd">
    <bpmn:startEvent id="S" />
    <bpmn:userTask id="U" name="Prüfen"><bpmn:documentation>Hinweis</bpmn:documentation></bpmn:userTask>
    <bpmn:inclusiveGateway id="G" />
    <bpmn:boundaryEvent id="B" attachedToRef="U" />
    <bpmn:endEvent id="E" />
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="U" />
    <bpmn:sequenceFlow id="F2" sourceRef="U" targetRef="G" />
    <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="E" />
  </bpmn:process>
</bpmn:definitions>`;
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  const { modell, abweichungen } = lesen(rootElement);
  assert.equal(modell.elemente.find((e) => e.id === "U").typ, "aufgabe");
  assert.equal(modell.elemente.find((e) => e.id === "U").beschreibung, "Hinweis");
  assert.equal(modell.elemente.find((e) => e.id === "G").typ, "xor");
  assert.equal(modell.rollen.length, 1);
  assert.ok(abweichungen.some((a) => a.includes("angeheftetes Ereignis")));
  assert.ok(abweichungen.some((a) => a.includes("inklusives Gateway")));
});

// KI-Antwort: "Nach Antrag prüfen noch Rechnung buchen" und "Antrag erfassen" umbenannt
function geaendertesBeispiel() {
  const neu = structuredClone(beispiel);
  for (const e of neu.elemente) delete e.beschreibung;
  neu.elemente.find((e) => e.id === "Task_AntragErfassen").name = "Antrag im Fachverfahren erfassen";
  neu.elemente.push({ id: "Task_RechnungBuchen", typ: "aufgabe", name: "Rechnung buchen", rolle: "Rolle_Sachbearbeitung" });
  neu.fluesse.find((f) => f.id === "Flow_4").von = "Task_RechnungBuchen";
  neu.fluesse.push({ id: "Flow_RechnungBuchen", von: "Task_AntragPruefen", nach: "Task_RechnungBuchen" });
  neu.aenderungen = ["Aufgabe „Rechnung buchen“ nach „Antrag prüfen“ eingefügt", "„Antrag erfassen“ umbenannt"];
  return neu;
}

test("Änderung: neue und geänderte Elemente werden erkannt, Beschreibungen bleiben", async () => {
  const anfragen = [];
  const llm = async ({ messages }) => {
    anfragen.push(messages.map((m) => m.content));
    return { content: JSON.stringify(geaendertesBeispiel()) };
  };
  const ergebnis = await aendereModell({
    modellJson: beispiel,
    anweisung: "Nach Antrag prüfen kommt noch Rechnung buchen.",
    bezug: { elementId: "Task_AntragPruefen", elementName: "Antrag prüfen" },
    model: { id: "test" },
    llm
  });

  assert.equal(anfragen.length, 1);
  const [system, nutzer] = anfragen[0];
  assert.ok(system.includes("ÄNDERUNGSMODUS"));
  assert.ok(nutzer.includes("Rechnung buchen"));
  assert.ok(nutzer.includes("Task_AntragPruefen"));
  assert.ok(!nutzer.includes("Vorlage aus dem Fachverfahren"), "Beschreibungen gehen nicht an die KI");

  assert.deepEqual(ergebnis.pruefung.fehler, []);
  assert.ok(ergebnis.aenderung.neu.includes("Task_RechnungBuchen"));
  assert.ok(ergebnis.aenderung.neu.includes("Flow_RechnungBuchen"));
  assert.ok(ergebnis.aenderung.geaendert.includes("Task_AntragErfassen"));
  assert.ok(ergebnis.aenderung.geaendert.includes("Flow_4"));
  assert.ok(!ergebnis.aenderung.geaendert.includes("Task_BescheidErstellen"));
  assert.deepEqual(ergebnis.aenderung.entfernt, []);
  assert.equal(ergebnis.aenderung.texte.length, 2);
  assert.equal(ergebnis.aenderung.unveraendert, false);
  assert.ok(ergebnis.xml.includes("Vorlage aus dem Fachverfahren verwenden."), "Beschreibung ist wieder im Modell");
});

test("Änderung: entfernte Elemente werden mit Namen gemeldet", async () => {
  const neu = structuredClone(beispiel);
  neu.elemente = neu.elemente.filter((e) => e.id !== "Task_AntragErfassen");
  neu.fluesse = neu.fluesse.filter((f) => f.id !== "Flow_2");
  neu.fluesse.find((f) => f.id === "Flow_1").nach = "Gateway_Zusammen";
  neu.daten = neu.daten.filter((d) => d.id !== "Data_Antrag");
  const ergebnis = await aendereModell({ modellJson: beispiel, anweisung: "Antrag erfassen fällt weg.", model: { id: "test" }, llm: async () => ({ content: JSON.stringify(neu) }) });
  assert.ok(ergebnis.aenderung.entfernt.some((e) => e.id === "Task_AntragErfassen" && e.name === "Antrag erfassen"));
  assert.ok(ergebnis.aenderung.entfernt.some((e) => e.id === "Data_Antrag"));
});

test("Änderung: Antwort auf eine Frage der KI wird als Bezug übergeben", async () => {
  let nutzer = "";
  const llm = async ({ messages }) => {
    nutzer = messages[1].content;
    return { content: JSON.stringify({ ...beispiel, unklarheiten: [] }) };
  };
  const ergebnis = await aendereModell({ modellJson: beispiel, anweisung: "Vier Wochen.", bezug: { frage: beispiel.unklarheiten[0] }, model: { id: "test" }, llm });
  assert.ok(nutzer.includes(beispiel.unklarheiten[0]));
  assert.deepEqual(ergebnis.unklarheiten, []);
});

test("Änderung: unklare Anweisung liefert Rückfrage und kein geändertes Modell", async () => {
  const llm = async () => ({ content: JSON.stringify({ ...beispiel, rueckfrage: "Welcher Schritt ist gemeint?" }) });
  const ergebnis = await aendereModell({ modellJson: beispiel, anweisung: "Mach das anders.", model: { id: "test" }, llm });
  assert.equal(ergebnis.aenderung.unveraendert, true);
  assert.equal(ergebnis.aenderung.rueckfrage, "Welcher Schritt ist gemeint?");
});
