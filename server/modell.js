// Das Prozessmodell als JSON: Format, das die KI liefert, und dessen Bereinigung.
//
// {
//   "prozessname": "...",
//   "pool": "Organisation oder Bereich",
//   "rollen":   [{ "id": "Rolle_Sachbearbeitung", "name": "Sachbearbeitung" }],
//   "externe":  [{ "id": "Extern_Antragstellende", "name": "Antragstellende" }],
//   "elemente": [{ "id": "Task_AntragPruefen", "typ": "aufgabe", "art": "", "name": "Antrag prüfen",
//                  "rolle": "Rolle_Sachbearbeitung", "beschreibung": "" }],
//   "fluesse":  [{ "id": "Flow_1", "von": "Start_AntragEingegangen", "nach": "Task_AntragPruefen", "name": "" }],
//   "nachrichten": [{ "id": "Msg_1", "von": "Extern_Antragstellende", "nach": "Start_AntragEingegangen", "name": "Antrag" }],
//   "daten":    [{ "id": "Data_Antrag", "typ": "datenobjekt", "name": "Antrag [eingegangen]",
//                  "rolle": "Rolle_Sachbearbeitung", "lesen": ["Task_AntragPruefen"], "schreiben": [] }],
//   "unklarheiten": ["..."]
// }

export const ELEMENT_TYPEN = {
  start: { bpmn: "bpmn:StartEvent", prefix: "Start", arten: ["unbestimmt", "nachricht", "zeit", "bedingt"] },
  zwischen: { bpmn: "bpmn:IntermediateCatchEvent", prefix: "Event", arten: ["unbestimmt", "nachricht", "zeit", "bedingt"] },
  ende: { bpmn: "bpmn:EndEvent", prefix: "End", arten: ["unbestimmt", "nachricht"] },
  aufgabe: { bpmn: "bpmn:Task", prefix: "Task", arten: [] },
  teilprozess: { bpmn: "bpmn:SubProcess", prefix: "Sub", arten: [] },
  xor: { bpmn: "bpmn:ExclusiveGateway", prefix: "Gateway", arten: [] },
  und: { bpmn: "bpmn:ParallelGateway", prefix: "Gateway", arten: [] },
  ereignisgateway: { bpmn: "bpmn:EventBasedGateway", prefix: "Gateway", arten: [] }
};

export const DATEN_TYPEN = {
  datenobjekt: { bpmn: "bpmn:DataObjectReference", prefix: "Data" },
  datenspeicher: { bpmn: "bpmn:DataStoreReference", prefix: "Store" }
};

const TYP_SYNONYME = {
  start: "start", startevent: "start", startereignis: "start",
  zwischen: "zwischen", intermediatecatchevent: "zwischen", intermediateevent: "zwischen", zwischenereignis: "zwischen",
  ende: "ende", end: "ende", endevent: "ende", endereignis: "ende",
  aufgabe: "aufgabe", task: "aufgabe", taetigkeit: "aufgabe", tätigkeit: "aufgabe", aktivitaet: "aufgabe", aktivität: "aufgabe",
  teilprozess: "teilprozess", subprocess: "teilprozess", unterprozess: "teilprozess",
  xor: "xor", exclusivegateway: "xor", exklusivesgateway: "xor", exklusiv: "xor",
  und: "und", and: "und", parallelgateway: "und", parallelesgateway: "und", parallel: "und",
  ereignisgateway: "ereignisgateway", eventbasedgateway: "ereignisgateway", ereignisbasiertesgateway: "ereignisgateway", ereignisbasiert: "ereignisgateway"
};

const ART_SYNONYME = {
  "": "unbestimmt", unbestimmt: "unbestimmt", none: "unbestimmt", leer: "unbestimmt",
  nachricht: "nachricht", message: "nachricht",
  zeit: "zeit", timer: "zeit", zeitbasiert: "zeit",
  bedingt: "bedingt", bedingung: "bedingt", conditional: "bedingt"
};

const DATEN_SYNONYME = {
  datenobjekt: "datenobjekt", dataobject: "datenobjekt", dokument: "datenobjekt",
  datenspeicher: "datenspeicher", datastore: "datenspeicher", speicher: "datenspeicher"
};

function text(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s_\-]/g, "");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Erzeugt gültige, eindeutige XML-IDs und merkt sich die Zuordnung alt -> neu.
function createIdRegistry() {
  // Reservierte IDs, die die XML-Erzeugung selbst verwendet
  const used = new Set(["Definitions_1", "Collaboration_1", "Participant_Main", "Process_1", "LaneSet_1", "BPMNDiagram_1", "BPMNPlane_1"]);
  const map = new Map();
  let counter = 0;

  function clean(raw) {
    let id = text(raw).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^A-Za-z0-9_]/g, "_");
    if (!/^[A-Za-z]/.test(id)) {
      id = id ? `X_${id}` : "";
    }
    return id.replace(/_+/g, "_").slice(0, 60);
  }

  return {
    claim(raw, prefix) {
      let id = clean(raw);
      if (!id) {
        counter += 1;
        id = `${prefix}_${counter}`;
      }
      let unique = id;
      let n = 2;
      while (used.has(unique)) {
        unique = `${id}_${n}`;
        n += 1;
      }
      used.add(unique);
      const original = text(raw);
      if (original && !map.has(original)) {
        map.set(original, unique);
      }
      return unique;
    },
    resolve(raw) {
      const original = text(raw);
      return map.get(original) || (used.has(original) ? original : null);
    }
  };
}

// Bereinigt die KI-Antwort. Gibt das Modell und Probleme zurück, die die KI korrigieren soll.
export function normalisiereModell(roh) {
  const probleme = [];
  const ids = createIdRegistry();
  const quelle = roh && typeof roh === "object" ? roh : {};

  const modell = {
    prozessname: text(quelle.prozessname || quelle.name),
    pool: text(quelle.pool),
    rollen: [],
    externe: [],
    elemente: [],
    fluesse: [],
    nachrichten: [],
    daten: [],
    unklarheiten: asArray(quelle.unklarheiten).map(text).filter(Boolean),
    nichtModelliert: asArray(quelle.nicht_modelliert ?? quelle.nichtModelliert).map(text).filter(Boolean)
  };

  for (const rolle of asArray(quelle.rollen)) {
    const name = text(rolle?.name ?? rolle);
    if (!name) continue;
    modell.rollen.push({ id: ids.claim(rolle?.id || `Rolle_${name}`, "Rolle"), name });
  }

  for (const extern of asArray(quelle.externe)) {
    const name = text(extern?.name ?? extern);
    if (!name) continue;
    modell.externe.push({ id: ids.claim(extern?.id || `Extern_${name}`, "Extern"), name });
  }

  const rolleFinden = (wert) => {
    if (modell.rollen.length === 0) return "";
    const direkt = ids.resolve(wert);
    if (direkt && modell.rollen.some((r) => r.id === direkt)) return direkt;
    const perName = modell.rollen.find((r) => key(r.name) === key(wert));
    return perName ? perName.id : null;
  };

  for (const element of asArray(quelle.elemente)) {
    const typ = TYP_SYNONYME[key(element?.typ)];
    if (!typ) {
      probleme.push({ regel: "§2", element: text(element?.id), text: `Element "${text(element?.name)}" hat den nicht erlaubten Typ "${text(element?.typ)}". Erlaubt: ${Object.keys(ELEMENT_TYPEN).join(", ")}.` });
      continue;
    }
    const def = ELEMENT_TYPEN[typ];
    let art = "";
    if (def.arten.length > 0) {
      art = ART_SYNONYME[key(element?.art)] || null;
      if (!art || !def.arten.includes(art)) {
        probleme.push({ regel: "§2", element: text(element?.id), text: `"${text(element?.name)}": Art "${text(element?.art)}" ist für ${typ} nicht erlaubt. Erlaubt: ${def.arten.join(", ")}.` });
        art = "unbestimmt";
      }
    }
    let rolle = rolleFinden(element?.rolle);
    if (rolle === null) {
      probleme.push({ regel: "§14", element: text(element?.id), text: `"${text(element?.name)}" verweist auf die unbekannte Rolle "${text(element?.rolle)}".` });
      rolle = modell.rollen[0].id;
    }
    modell.elemente.push({
      id: ids.claim(element?.id, def.prefix),
      typ,
      art,
      name: text(element?.name),
      rolle,
      beschreibung: text(element?.beschreibung)
    });
  }

  const elementIds = new Set(modell.elemente.map((e) => e.id));
  const externIds = new Set(modell.externe.map((e) => e.id));

  for (const fluss of asArray(quelle.fluesse)) {
    const von = ids.resolve(fluss?.von);
    const nach = ids.resolve(fluss?.nach);
    if (!elementIds.has(von) || !elementIds.has(nach)) {
      probleme.push({ regel: "§13", element: text(fluss?.id), text: `Sequenzfluss von "${text(fluss?.von)}" nach "${text(fluss?.nach)}" verweist auf ein unbekanntes Element oder führt über eine Poolgrenze.` });
      continue;
    }
    if (von === nach) {
      probleme.push({ regel: "§13", element: text(fluss?.id), text: `Sequenzfluss "${text(fluss?.id)}" verbindet ein Element mit sich selbst.` });
      continue;
    }
    modell.fluesse.push({ id: ids.claim(fluss?.id, "Flow"), von, nach, name: text(fluss?.name) });
  }

  for (const nachricht of asArray(quelle.nachrichten)) {
    const von = ids.resolve(nachricht?.von);
    const nach = ids.resolve(nachricht?.nach);
    const gueltig = (externIds.has(von) && elementIds.has(nach)) || (elementIds.has(von) && externIds.has(nach));
    if (!gueltig) {
      probleme.push({ regel: "§15", element: text(nachricht?.id), text: `Nachrichtenfluss von "${text(nachricht?.von)}" nach "${text(nachricht?.nach)}" muss genau einen externen Beteiligten und ein Element des eigenen Pools verbinden.` });
      continue;
    }
    modell.nachrichten.push({ id: ids.claim(nachricht?.id, "Msg"), von, nach, name: text(nachricht?.name) });
  }

  for (const daten of asArray(quelle.daten)) {
    const typ = DATEN_SYNONYME[key(daten?.typ)] || "datenobjekt";
    const lesen = asArray(daten?.lesen).map((ref) => ids.resolve(ref)).filter((ref) => elementIds.has(ref));
    const schreiben = asArray(daten?.schreiben).map((ref) => ids.resolve(ref)).filter((ref) => elementIds.has(ref));
    if (lesen.length + schreiben.length === 0) {
      probleme.push({ regel: "§16", element: text(daten?.id), text: `Datenobjekt "${text(daten?.name)}" ist mit keiner Aufgabe verbunden.` });
      continue;
    }
    let rolle = rolleFinden(daten?.rolle);
    if (!rolle) {
      const erstes = modell.elemente.find((e) => e.id === (schreiben[0] || lesen[0]));
      rolle = erstes ? erstes.rolle : "";
    }
    modell.daten.push({ id: ids.claim(daten?.id, DATEN_TYPEN[typ].prefix), typ, name: text(daten?.name), rolle, lesen, schreiben });
  }

  if (!modell.prozessname) {
    modell.prozessname = "Neuer Prozess";
  }

  return { modell, probleme };
}
