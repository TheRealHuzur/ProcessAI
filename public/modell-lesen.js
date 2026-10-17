// Liest das Modell aus dem Editor zurück in das JSON-Format der KI (siehe server/modell.js).
// Grundlage für Änderungen per Sprachbefehl: Die KI bekommt immer den aktuellen Stand,
// auch mit Änderungen von Hand. Läuft im Browser (bpmn-js) und in den Tests (bpmn-moddle).
(function (global) {
  "use strict";

  const TYPEN = {
    "bpmn:StartEvent": "start",
    "bpmn:IntermediateCatchEvent": "zwischen",
    "bpmn:EndEvent": "ende",
    "bpmn:Task": "aufgabe",
    "bpmn:SubProcess": "teilprozess",
    "bpmn:ExclusiveGateway": "xor",
    "bpmn:ParallelGateway": "und",
    "bpmn:EventBasedGateway": "ereignisgateway"
  };

  // Kommen in Modellen aus anderen Werkzeugen vor und werden auf das Basis-Level abgebildet
  const ANGENAEHERT = {
    "bpmn:UserTask": "aufgabe",
    "bpmn:ManualTask": "aufgabe",
    "bpmn:ServiceTask": "aufgabe",
    "bpmn:ScriptTask": "aufgabe",
    "bpmn:SendTask": "aufgabe",
    "bpmn:ReceiveTask": "aufgabe",
    "bpmn:BusinessRuleTask": "aufgabe",
    "bpmn:CallActivity": "teilprozess",
    "bpmn:IntermediateThrowEvent": "zwischen",
    "bpmn:InclusiveGateway": "xor"
  };

  const ARTEN = {
    "bpmn:MessageEventDefinition": "nachricht",
    "bpmn:TimerEventDefinition": "zeit",
    "bpmn:ConditionalEventDefinition": "bedingt"
  };

  const TYP_NAMEN = {
    "bpmn:InclusiveGateway": "inklusives Gateway (als exklusives gelesen)",
    "bpmn:IntermediateThrowEvent": "sendendes Zwischenereignis (als Zwischenereignis gelesen)",
    "bpmn:BoundaryEvent": "angeheftetes Ereignis",
    "bpmn:ComplexGateway": "komplexes Gateway"
  };

  function name(x) {
    return (x && x.name) || "";
  }

  function beschreibung(x) {
    return (x.documentation || []).map((d) => d.text || "").join("\n\n").trim();
  }

  function flussElementeVon(prozess) {
    return (prozess && prozess.flowElements) || [];
  }

  function blattBahnen(laneSet, liste) {
    for (const lane of (laneSet && laneSet.lanes) || []) {
      if (lane.childLaneSet && (lane.childLaneSet.lanes || []).length) blattBahnen(lane.childLaneSet, liste);
      else liste.push(lane);
    }
    return liste;
  }

  // definitions: modeler.getDefinitions() bzw. rootElement aus bpmn-moddle
  // Ergebnis: { modell, abweichungen } – abweichungen nennt, was beim Ändern verloren geht oder angenähert wird
  function lesen(definitions) {
    const abweichungen = [];
    const roots = (definitions && definitions.rootElements) || [];
    const kollaboration = roots.find((r) => r.$type === "bpmn:Collaboration");
    const teilnehmer = (kollaboration && kollaboration.participants) || [];
    const haupt = teilnehmer.find((p) => flussElementeVon(p.processRef).length > 0) || teilnehmer.find((p) => p.processRef) || null;
    const prozess = haupt ? haupt.processRef : roots.find((r) => r.$type === "bpmn:Process" && flussElementeVon(r).length > 0) || roots.find((r) => r.$type === "bpmn:Process");
    if (!prozess) return { modell: null, abweichungen: ["Im Editor ist kein Prozess vorhanden."] };

    const externe = [];
    for (const p of teilnehmer) {
      if (p === haupt) continue;
      if (flussElementeVon(p.processRef).length > 0) {
        abweichungen.push(`Der Ablauf im Pool "${name(p) || p.id}" wird nicht bearbeitet und geht verloren; der Pool bleibt als Beteiligter.`);
      }
      externe.push({ id: p.id, name: name(p) });
    }

    const bahnen = [];
    for (const laneSet of prozess.laneSets || []) blattBahnen(laneSet, bahnen);
    const rollen = bahnen.map((lane) => ({ id: lane.id, name: name(lane) }));
    const rolleVon = new Map();
    for (const lane of bahnen) {
      for (const ref of lane.flowNodeRef || []) rolleVon.set(ref.id, lane.id);
    }
    if (rollen.length === 0) {
      rollen.push({ id: "Rolle_Prozess", name: name(haupt) || name(prozess) || "Prozess" });
    }

    const elemente = [];
    const fluesse = [];
    const datenRefs = [];
    const nichtUnterstuetzt = new Map();
    const naeherung = new Map();

    for (const fe of flussElementeVon(prozess)) {
      const typ = fe.$type;
      if (typ === "bpmn:SequenceFlow") {
        fluesse.push({ id: fe.id, von: fe.sourceRef && fe.sourceRef.id, nach: fe.targetRef && fe.targetRef.id, name: name(fe) });
        continue;
      }
      if (typ === "bpmn:DataObjectReference" || typ === "bpmn:DataStoreReference") {
        datenRefs.push(fe);
        continue;
      }
      if (typ === "bpmn:DataObject") continue;
      const eigenerTyp = TYPEN[typ] || ANGENAEHERT[typ];
      if (!eigenerTyp) {
        nichtUnterstuetzt.set(typ, (nichtUnterstuetzt.get(typ) || 0) + 1);
        continue;
      }
      if (ANGENAEHERT[typ] && TYP_NAMEN[typ]) naeherung.set(typ, (naeherung.get(typ) || 0) + 1);

      let art = "";
      if (eigenerTyp === "start" || eigenerTyp === "zwischen" || eigenerTyp === "ende") {
        const definition = (fe.eventDefinitions || [])[0];
        art = definition ? ARTEN[definition.$type] || "unbestimmt" : "unbestimmt";
      }
      if (eigenerTyp === "teilprozess" && flussElementeVon(fe).length > 0) {
        abweichungen.push(`Der Inhalt des Teilprozesses "${name(fe) || fe.id}" geht verloren; der Teilprozess bleibt als ein Schritt.`);
      }
      elemente.push({
        id: fe.id,
        typ: eigenerTyp,
        art,
        name: name(fe),
        rolle: rolleVon.get(fe.id) || rollen[0].id,
        beschreibung: beschreibung(fe)
      });
    }

    // Daten: Darstellungen desselben Datenobjekts bzw. Datenspeichers zusammenfassen
    const daten = new Map();
    const datenVonRef = new Map();
    for (const ref of datenRefs) {
      const ziel = ref.dataObjectRef || ref.dataStoreRef;
      const schluessel = ziel ? ziel.id : ref.id;
      if (!daten.has(schluessel)) {
        daten.set(schluessel, {
          id: schluessel.replace(/_(Object|Store)$/, ""),
          typ: ref.$type === "bpmn:DataStoreReference" ? "datenspeicher" : "datenobjekt",
          name: name(ref) || name(ziel),
          rolle: "",
          lesen: [],
          schreiben: []
        });
      }
      datenVonRef.set(ref.id, daten.get(schluessel));
    }
    for (const fe of flussElementeVon(prozess)) {
      for (const assoc of fe.dataInputAssociations || []) {
        for (const quelle of assoc.sourceRef || []) {
          const d = quelle && datenVonRef.get(quelle.id);
          if (d && !d.lesen.includes(fe.id)) d.lesen.push(fe.id);
        }
      }
      for (const assoc of fe.dataOutputAssociations || []) {
        const d = assoc.targetRef && datenVonRef.get(assoc.targetRef.id);
        if (d && !d.schreiben.includes(fe.id)) d.schreiben.push(fe.id);
      }
    }

    const nachrichten = [];
    for (const mf of (kollaboration && kollaboration.messageFlows) || []) {
      const von = mf.sourceRef && mf.sourceRef.id;
      const nach = mf.targetRef && mf.targetRef.id;
      if (haupt && (von === haupt.id || nach === haupt.id)) {
        abweichungen.push(`Der Nachrichtenfluss "${name(mf) || mf.id}" hängt am eigenen Pool statt an einem Schritt und geht verloren.`);
        continue;
      }
      nachrichten.push({ id: mf.id, von, nach, name: name(mf) });
    }

    for (const [typ, anzahl] of nichtUnterstuetzt) {
      abweichungen.push(`${anzahl}× ${TYP_NAMEN[typ] || typ.replace("bpmn:", "")} gehört nicht zum Basis-Level und geht verloren.`);
    }
    for (const [typ, anzahl] of naeherung) {
      abweichungen.push(`${anzahl}× ${TYP_NAMEN[typ]}.`);
    }
    const anmerkungen = (prozess.artifacts || []).filter((a) => a.$type === "bpmn:TextAnnotation").length;
    if (anmerkungen) abweichungen.push(`${anmerkungen}× Textanmerkung geht verloren.`);

    return {
      modell: {
        prozessname: name(prozess) || name(haupt),
        pool: name(haupt),
        rollen,
        externe,
        elemente,
        fluesse,
        nachrichten,
        daten: [...daten.values()],
        unklarheiten: [],
        nicht_modelliert: []
      },
      abweichungen
    };
  }

  global.PPModellLesen = { lesen };
})(typeof window !== "undefined" ? window : globalThis);
