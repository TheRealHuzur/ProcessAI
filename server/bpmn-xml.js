// Erzeugt BPMN-2.0-XML inklusive Diagramm-Informationen aus Modell und Anordnung.
import { ELEMENT_TYPEN, DATEN_TYPEN } from "./modell.js";

const TAGS = {
  start: "startEvent",
  zwischen: "intermediateCatchEvent",
  ende: "endEvent",
  aufgabe: "task",
  teilprozess: "subProcess",
  xor: "exclusiveGateway",
  und: "parallelGateway",
  ereignisgateway: "eventBasedGateway"
};

const EVENT_DEFINITION = {
  nachricht: "messageEventDefinition",
  zeit: "timerEventDefinition",
  bedingt: "conditionalEventDefinition"
};

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attrName(name) {
  return name ? ` name="${esc(name)}"` : "";
}

function bounds(b) {
  return `<dc:Bounds x="${Math.round(b.x)}" y="${Math.round(b.y)}" width="${Math.round(b.w)}" height="${Math.round(b.h)}" />`;
}

function waypoints(punkte) {
  return punkte.map((p) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join("");
}

export function erzeugeBpmnXml(modell, layout) {
  const poolName = modell.rollen.length === 1 ? modell.rollen[0].name : (modell.pool || modell.prozessname);
  const prozessId = "Process_1";
  const zeilen = [];
  const di = [];
  const push = (s) => zeilen.push(s);

  const eingehend = new Map(modell.elemente.map((e) => [e.id, []]));
  const ausgehend = new Map(modell.elemente.map((e) => [e.id, []]));
  for (const fluss of modell.fluesse) {
    ausgehend.get(fluss.von).push(fluss.id);
    eingehend.get(fluss.nach).push(fluss.id);
  }

  const lesenJeElement = new Map();
  const schreibenJeElement = new Map();
  for (const daten of modell.daten) {
    for (const ziel of daten.lesen) {
      if (!lesenJeElement.has(ziel)) lesenJeElement.set(ziel, []);
      lesenJeElement.get(ziel).push(daten);
    }
    for (const quelle of daten.schreiben) {
      if (!schreibenJeElement.has(quelle)) schreibenJeElement.set(quelle, []);
      schreibenJeElement.get(quelle).push(daten);
    }
  }

  push(`<?xml version="1.0" encoding="UTF-8"?>`);
  push(`<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="https://prozesspilot.wissen-und-werkzeug.de/schema" exporter="ProzessPilot" exporterVersion="0.1.0">`);

  // Kollaboration: eigener Pool, Black-Box-Pools, Nachrichtenflüsse
  push(`  <bpmn:collaboration id="Collaboration_1">`);
  push(`    <bpmn:participant id="Participant_Main"${attrName(poolName)} processRef="${prozessId}" />`);
  for (const extern of modell.externe) {
    push(`    <bpmn:participant id="${extern.id}"${attrName(extern.name)} />`);
  }
  for (const nachricht of modell.nachrichten) {
    push(`    <bpmn:messageFlow id="${nachricht.id}"${attrName(nachricht.name)} sourceRef="${nachricht.von}" targetRef="${nachricht.nach}" />`);
  }
  push(`  </bpmn:collaboration>`);

  push(`  <bpmn:process id="${prozessId}"${attrName(modell.prozessname)} isExecutable="false">`);

  if (layout.mitBahnen) {
    push(`    <bpmn:laneSet id="LaneSet_1">`);
    for (const rolle of modell.rollen) {
      push(`      <bpmn:lane id="${rolle.id}"${attrName(rolle.name)}>`);
      for (const element of modell.elemente.filter((e) => e.rolle === rolle.id)) {
        push(`        <bpmn:flowNodeRef>${element.id}</bpmn:flowNodeRef>`);
      }
      push(`      </bpmn:lane>`);
    }
    push(`    </bpmn:laneSet>`);
  }

  for (const element of modell.elemente) {
    const tag = TAGS[element.typ];
    push(`    <bpmn:${tag} id="${element.id}"${attrName(element.name)}>`);
    if (element.beschreibung) {
      push(`      <bpmn:documentation>${esc(element.beschreibung)}</bpmn:documentation>`);
    }
    for (const id of eingehend.get(element.id)) push(`      <bpmn:incoming>${id}</bpmn:incoming>`);
    for (const id of ausgehend.get(element.id)) push(`      <bpmn:outgoing>${id}</bpmn:outgoing>`);

    const lesen = lesenJeElement.get(element.id) || [];
    const schreiben = schreibenJeElement.get(element.id) || [];
    if (lesen.length > 0) {
      push(`      <bpmn:property id="Property_${element.id}" name="__targetRef_placeholder" />`);
      for (const daten of lesen) {
        push(`      <bpmn:dataInputAssociation id="DIA_${daten.id}_${element.id}"><bpmn:sourceRef>${daten.id}</bpmn:sourceRef><bpmn:targetRef>Property_${element.id}</bpmn:targetRef></bpmn:dataInputAssociation>`);
      }
    }
    for (const daten of schreiben) {
      push(`      <bpmn:dataOutputAssociation id="DOA_${element.id}_${daten.id}"><bpmn:targetRef>${daten.id}</bpmn:targetRef></bpmn:dataOutputAssociation>`);
    }

    const definition = EVENT_DEFINITION[element.art];
    if (definition) {
      if (definition === "conditionalEventDefinition") {
        push(`      <bpmn:${definition} id="${element.id}_Definition"><bpmn:condition xsi:type="bpmn:tFormalExpression" /></bpmn:${definition}>`);
      } else {
        push(`      <bpmn:${definition} id="${element.id}_Definition" />`);
      }
    }
    push(`    </bpmn:${tag}>`);
  }

  for (const daten of modell.daten) {
    if (daten.typ === "datenspeicher") {
      push(`    <bpmn:dataStoreReference id="${daten.id}"${attrName(daten.name)} />`);
    } else {
      push(`    <bpmn:dataObject id="${daten.id}_Object" />`);
      push(`    <bpmn:dataObjectReference id="${daten.id}"${attrName(daten.name)} dataObjectRef="${daten.id}_Object" />`);
    }
  }

  for (const fluss of modell.fluesse) {
    push(`    <bpmn:sequenceFlow id="${fluss.id}"${attrName(fluss.name)} sourceRef="${fluss.von}" targetRef="${fluss.nach}" />`);
  }

  push(`  </bpmn:process>`);

  // Diagramm
  di.push(`  <bpmndi:BPMNDiagram id="BPMNDiagram_1">`);
  di.push(`    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">`);
  di.push(`      <bpmndi:BPMNShape id="Participant_Main_di" bpmnElement="Participant_Main" isHorizontal="true">${bounds(layout.pool)}</bpmndi:BPMNShape>`);
  for (const lane of layout.lanes) {
    di.push(`      <bpmndi:BPMNShape id="${lane.id}_di" bpmnElement="${lane.id}" isHorizontal="true">${bounds(lane.bounds)}</bpmndi:BPMNShape>`);
  }
  for (const element of modell.elemente) {
    const extra = element.typ === "teilprozess" ? ` isExpanded="false"` : element.typ === "xor" ? ` isMarkerVisible="true"` : "";
    di.push(`      <bpmndi:BPMNShape id="${element.id}_di" bpmnElement="${element.id}"${extra}>${bounds(layout.shapes.get(element.id))}</bpmndi:BPMNShape>`);
  }
  for (const daten of modell.daten) {
    di.push(`      <bpmndi:BPMNShape id="${daten.id}_di" bpmnElement="${daten.id}">${bounds(layout.shapes.get(daten.id))}</bpmndi:BPMNShape>`);
  }
  for (const extern of modell.externe) {
    di.push(`      <bpmndi:BPMNShape id="${extern.id}_di" bpmnElement="${extern.id}" isHorizontal="true">${bounds(layout.externPools.get(extern.id).bounds)}</bpmndi:BPMNShape>`);
  }
  for (const fluss of modell.fluesse) {
    di.push(`      <bpmndi:BPMNEdge id="${fluss.id}_di" bpmnElement="${fluss.id}">${waypoints(layout.kanten.get(fluss.id))}</bpmndi:BPMNEdge>`);
  }
  for (const nachricht of modell.nachrichten) {
    di.push(`      <bpmndi:BPMNEdge id="${nachricht.id}_di" bpmnElement="${nachricht.id}">${waypoints(layout.kanten.get(nachricht.id))}</bpmndi:BPMNEdge>`);
  }
  for (const daten of modell.daten) {
    for (const ziel of daten.lesen) {
      const id = `DIA_${daten.id}_${ziel}`;
      di.push(`      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${waypoints(layout.kanten.get(id))}</bpmndi:BPMNEdge>`);
    }
    for (const quelle of daten.schreiben) {
      const id = `DOA_${quelle}_${daten.id}`;
      di.push(`      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${waypoints(layout.kanten.get(id))}</bpmndi:BPMNEdge>`);
    }
  }
  di.push(`    </bpmndi:BPMNPlane>`);
  di.push(`  </bpmndi:BPMNDiagram>`);

  return [...zeilen, ...di, `</bpmn:definitions>`, ""].join("\n");
}

// Für Tests und Doku: welche BPMN-Typen entstehen
export const BPMN_TYPEN = { ...Object.fromEntries(Object.entries(ELEMENT_TYPEN).map(([k, v]) => [k, v.bpmn])), ...Object.fromEntries(Object.entries(DATEN_TYPEN).map(([k, v]) => [k, v.bpmn])) };
