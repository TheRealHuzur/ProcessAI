// Darstellungsregeln aus docs/bpmn-regelwerk.md, Abschnitt 17, und Tokenprinzip aus Abschnitt 11
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BpmnModdle from "bpmn-moddle";
import { bauenAusJson, zuXml } from "../server/pipeline.js";
import { ABSTAND_BAHN } from "../server/layout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lade = (datei) => JSON.parse(fs.readFileSync(path.join(__dirname, datei), "utf8"));
const MODELLE = {
  beispiel: lade("../examples/antrag-beispielmodell.json"),
  beschaffung: lade("fixtures/beschaffung.json")
};
const GATEWAYS = new Set(["bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:EventBasedGateway"]);

async function diagramm(roh) {
  const { modell } = bauenAusJson(roh);
  const { rootElement, elementsById } = await new BpmnModdle().fromXML(zuXml(modell));
  const plane = rootElement.diagrams[0].plane.planeElement;
  const boxen = new Map();
  const wege = new Map();
  for (const di of plane) {
    if (di.bounds) boxen.set(di.bpmnElement.id, di.bounds);
    if (di.waypoint) wege.set(di.bpmnElement.id, di.waypoint.map((p) => ({ x: p.x, y: p.y })));
  }
  const prozess = rootElement.rootElements.find((e) => e.$type === "bpmn:Process");
  const fluesse = prozess.flowElements.filter((e) => e.$type === "bpmn:SequenceFlow");
  const lanes = prozess.laneSets?.[0]?.lanes || [];
  return { elementsById, boxen, wege, fluesse, lanes, prozess };
}

function seite(box, p) {
  if (Math.abs(p.x - box.x) < 1) return "l";
  if (Math.abs(p.x - (box.x + box.width)) < 1) return "r";
  if (Math.abs(p.y - box.y) < 1) return "t";
  if (Math.abs(p.y - (box.y + box.height)) < 1) return "b";
  return "?";
}

function segmente(pts) {
  return pts.slice(1).map((b, i) => ({ a: pts[i], b }));
}

function kreuzen(s, t) {
  const sH = s.a.y === s.b.y;
  const tH = t.a.y === t.b.y;
  if (sH === tH) return false;
  const h = sH ? s : t;
  const v = sH ? t : s;
  return v.a.x > Math.min(h.a.x, h.b.x) + 1 && v.a.x < Math.max(h.a.x, h.b.x) - 1 && h.a.y > Math.min(v.a.y, v.b.y) + 1 && h.a.y < Math.max(v.a.y, v.b.y) - 1;
}

for (const [name, roh] of Object.entries(MODELLE)) {
  test(`${name}: Aufgaben und Ereignisse links hinein, rechts heraus (17.2)`, async () => {
    const { fluesse, boxen, wege } = await diagramm(roh);
    for (const fluss of fluesse) {
      const pts = wege.get(fluss.id);
      if (!GATEWAYS.has(fluss.sourceRef.$type)) assert.equal(seite(boxen.get(fluss.sourceRef.id), pts[0]), "r", `${fluss.id} verlässt ${fluss.sourceRef.id} nicht rechts`);
      if (!GATEWAYS.has(fluss.targetRef.$type)) assert.equal(seite(boxen.get(fluss.targetRef.id), pts.at(-1)), "l", `${fluss.id} erreicht ${fluss.targetRef.id} nicht links`);
    }
  });

  test(`${name}: Gateways nutzen je Fluss eine eigene Kante (17.3)`, async () => {
    const { fluesse, boxen, wege, elementsById } = await diagramm(roh);
    const jeGateway = new Map();
    for (const fluss of fluesse) {
      const pts = wege.get(fluss.id);
      for (const [element, p] of [[fluss.sourceRef, pts[0]], [fluss.targetRef, pts.at(-1)]]) {
        if (!GATEWAYS.has(element.$type)) continue;
        const s = seite(boxen.get(element.id), p);
        assert.notEqual(s, "?", `${fluss.id} endet an ${element.id} nicht mittig auf einer Kante`);
        if (!jeGateway.has(element.id)) jeGateway.set(element.id, []);
        jeGateway.get(element.id).push(s);
      }
    }
    for (const [id, seiten] of jeGateway) {
      if (seiten.length <= 4) assert.equal(new Set(seiten).size, seiten.length, `${elementsById[id].id}: ${seiten.join(",")}`);
    }
  });

  test(`${name}: Sequenzflüsse laufen nicht durch Symbole (17.5)`, async () => {
    const { fluesse, boxen, wege } = await diagramm(roh);
    const formen = [...boxen].filter(([id]) => !id.startsWith("Participant") && !id.startsWith("Rolle_") && !id.startsWith("Extern_"));
    for (const fluss of fluesse) {
      const segs = segmente(wege.get(fluss.id));
      segs.forEach((s, i) => {
        for (const [id, b] of formen) {
          if ((i === 0 && id === fluss.sourceRef.id) || (i === segs.length - 1 && id === fluss.targetRef.id)) continue;
          const trifft = Math.max(s.a.x, s.b.x) > b.x && Math.min(s.a.x, s.b.x) < b.x + b.width && Math.max(s.a.y, s.b.y) > b.y && Math.min(s.a.y, s.b.y) < b.y + b.height;
          assert.ok(!trifft, `${fluss.id} läuft durch ${id}`);
        }
      });
    }
  });

  test(`${name}: Abstand zwischen Sequenzfluss und Bahngrenze (17.4)`, async () => {
    const { fluesse, boxen, wege, lanes } = await diagramm(roh);
    const grenzen = lanes.flatMap((l) => [boxen.get(l.id).y, boxen.get(l.id).y + boxen.get(l.id).height]);
    for (const fluss of fluesse) {
      for (const s of segmente(wege.get(fluss.id))) {
        if (s.a.y !== s.b.y) continue;
        for (const g of grenzen) assert.ok(Math.abs(s.a.y - g) >= ABSTAND_BAHN, `${fluss.id} liegt ${Math.abs(s.a.y - g)} px neben einer Bahngrenze`);
      }
    }
  });
}

test("Datenobjekt steht an jeder Aufgabe einzeln, mit der passenden Verbindung (16, 17.1)", async () => {
  const { prozess, wege } = await diagramm(MODELLE.beschaffung);
  const refs = prozess.flowElements.filter((e) => e.$type === "bpmn:DataObjectReference");
  assert.equal(refs.length, 4);
  assert.equal(new Set(refs.map((r) => r.dataObjectRef.id)).size, 1);
  const aufgabe = (id) => prozess.flowElements.find((e) => e.id === id);
  assert.equal(aufgabe("Task_AntragAusfuellen").dataOutputAssociations.length, 1);
  for (const id of ["Task_AntragSichten", "Task_Entscheiden", "Task_AntragUeberarbeiten"]) {
    const ein = aufgabe(id).dataInputAssociations;
    assert.equal(ein.length, 1, id);
    assert.ok(wege.get(ein[0].id).length === 2, `${id}: kurze, direkte Verbindung`);
  }
});

test("Ausgänge eines Gateways werden so verteilt, dass Kreuzungen entfallen (17.6)", async () => {
  const { fluesse, wege, boxen } = await diagramm(MODELLE.beschaffung);
  const flussVon = (von, nach) => fluesse.find((f) => f.sourceRef.id === von && f.targetRef.id === nach);
  const defekt = wege.get(flussVon("Gateway_WareOkay", "Task_ReklamationDurchfuehren").id);
  const ok = wege.get(flussVon("Gateway_WareOkay", "Task_RechnungWeiterleiten").id);
  assert.equal(seite(boxen.get("Gateway_WareOkay"), defekt[0]), "r");
  assert.equal(seite(boxen.get("Gateway_WareOkay"), ok[0]), "b");
  const weiter = segmente(wege.get(flussVon("Task_RechnungWeiterleiten", "Task_RechnungBezahlen").id));
  const andere = [...wege].filter(([id]) => !id.startsWith("Participant")).flatMap(([id, pts]) => (pts.length > 1 && !id.includes("RechnungWeiterleiten") ? segmente(pts) : []));
  for (const s of weiter) assert.ok(!andere.some((t) => kreuzen(s, t)), "Weg zur Kämmerei kreuzt einen anderen Fluss");
});

test("Tokenprinzip: Pfad endet vor der parallelen Zusammenführung (11)", () => {
  const { pruefung } = bauenAusJson(MODELLE.beschaffung);
  const befund = pruefung.fehler.find((f) => f.regel === "§11");
  assert.ok(befund, "Verklemmung nicht erkannt");
  assert.equal(befund.element, "Gateway_ParallelEnd");
  assert.ok(befund.text.includes("Beschaffung ist abgelehnt") && befund.text.includes("Erinnerung ist gesendet"));
});

test("Tokenprinzip: parallele Pfade über XOR zusammengeführt (11)", () => {
  const roh = {
    elemente: [
      { id: "S", typ: "start", name: "Auftrag ist eingegangen" },
      { id: "P", typ: "und" },
      { id: "A", typ: "aufgabe", name: "Angebot einholen" },
      { id: "B", typ: "aufgabe", name: "Mittel anfragen" },
      { id: "X", typ: "xor" },
      { id: "C", typ: "aufgabe", name: "Auftrag erteilen" },
      { id: "E", typ: "ende", name: "Auftrag ist erteilt" }
    ],
    fluesse: [
      { von: "S", nach: "P" }, { von: "P", nach: "A" }, { von: "P", nach: "B" },
      { von: "A", nach: "X" }, { von: "B", nach: "X" }, { von: "X", nach: "C" }, { von: "C", nach: "E" }
    ]
  };
  const { pruefung } = bauenAusJson(roh);
  assert.ok(pruefung.fehler.some((f) => f.regel === "§11" && f.text.includes("mehrfach")));

  const richtig = structuredClone(roh);
  richtig.elemente.find((e) => e.id === "X").typ = "und";
  assert.deepEqual(bauenAusJson(richtig).pruefung.fehler, []);
});
