// Wissen am Prozessschritt: weitere Angaben neben der Arbeitshilfe (Dokumente, Ansprechpersonen, Rechtsgrundlagen).
// Die Arbeitshilfe bleibt im BPMN-Feld documentation. Die weiteren Angaben stehen als eigene Erweiterung
// (Namensraum pp) in den extensionElements des Elements, reisen also mit der .bpmn-Datei und jeder Version.
// Läuft im Browser (Editor, Rücklesen) und auf dem Server (KI-Ablauf, Handbuch).
(function (root) {
  "use strict";

  const FELDER = [
    { key: "dokumente", tag: "dokument", typ: "Dokument", titel: "Dokumente und Vorlagen" },
    { key: "ansprechpersonen", tag: "ansprechperson", typ: "Ansprechperson", titel: "Ansprechpersonen" },
    { key: "rechtsgrundlagen", tag: "rechtsgrundlage", typ: "Rechtsgrundlage", titel: "Rechtsgrundlagen" }
  ];

  const URI = "https://prozesspilot.wissen-und-werkzeug.de/schema/wissen";

  // Beschreibung für bpmn-moddle: <pp:wissen><pp:dokument>…</pp:dokument>…</pp:wissen>
  const descriptor = {
    name: "ProzessPilot",
    uri: URI,
    prefix: "pp",
    xml: { tagAlias: "lowerCase" },
    associations: [],
    types: [
      {
        name: "Wissen",
        superClass: ["Element"],
        properties: FELDER.map((f) => ({ name: f.tag, type: f.typ, isMany: true }))
      },
      ...FELDER.map((f) => ({ name: f.typ, properties: [{ name: "text", type: "String", isBody: true }] }))
    ]
  };

  function leer() {
    return Object.fromEntries(FELDER.map((f) => [f.key, []]));
  }

  function istLeer(wissen) {
    return !wissen || FELDER.every((f) => !Array.isArray(wissen[f.key]) || wissen[f.key].length === 0);
  }

  // Eine Angabe je Zeile, leere Zeilen fallen weg
  function zeilen(text) {
    return String(text || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  }

  // Liest die Angaben aus einem BPMN-Element (bpmn-moddle-Objekt)
  function lesen(bo) {
    const ergebnis = leer();
    const werte = (bo && bo.extensionElements && bo.extensionElements.values) || [];
    for (const w of werte) {
      if (!w || w.$type !== "pp:Wissen") continue;
      for (const f of FELDER) {
        for (const eintrag of w[f.tag] || []) ergebnis[f.key].push(...zeilen(eintrag && eintrag.text));
      }
    }
    return ergebnis;
  }

  // Liefert die neuen extensionElements für ein Element (andere Erweiterungen bleiben erhalten)
  function alsExtensionElements(moddle, bo, wissen) {
    const andere = ((bo.extensionElements && bo.extensionElements.values) || []).filter((w) => w.$type !== "pp:Wissen");
    const values = [...andere];
    if (!istLeer(wissen)) {
      const eigenschaften = {};
      for (const f of FELDER) {
        eigenschaften[f.tag] = (wissen[f.key] || []).map((text) => moddle.create(`pp:${f.typ}`, { text }));
      }
      values.push(moddle.create("pp:Wissen", eigenschaften));
    }
    return values.length ? moddle.create("bpmn:ExtensionElements", { values }) : undefined;
  }

  root.PPWissen = { FELDER, URI, descriptor, leer, istLeer, zeilen, lesen, alsExtensionElements };
})(typeof window !== "undefined" ? window : globalThis);
