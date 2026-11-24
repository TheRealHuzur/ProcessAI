// Einleser für Exporte aus der PICTURE-Prozessplattform (Namensraum http://www.picture-gmbh.de/bpmn-ext).
// PICTURE legt den Inhalt eines Teilprozesses als eigenen Prozess mit eigenem Pool in ein eigenes
// Diagramm; die Verbindung steht nur im Feld "subDiagramLink" am Teilprozess. Felder stehen in
// pic:attributes > pic:attributeGroup > <xxxValue attributeID name dataType>.
// Siehe PICTURE_EXPORT_BEFUND.md in der Projektdoku.

const kinder = (o) => (o && (o.$children || o.values)) || [];
const text = (o) => String((o && o.$body) || "").trim();
const unterknoten = (o, typ) => kinder(o).find((c) => c.$type === typ);

// Alle PICTURE-Felder eines Elements: { gruppe, id, name, typ, art, wert, referenzen }
export function pictureFelder(bo) {
  const felder = [];
  for (const attribute of kinder(bo && bo.extensionElements).filter((e) => e.$type === "pic:attributes")) {
    for (const gruppe of kinder(attribute).filter((g) => g.$type === "pic:attributeGroup")) {
      for (const feld of kinder(gruppe)) {
        const referenzen = kinder(unterknoten(feld, "references"))
          .filter((r) => r.$type === "reference")
          .map((r) => ({ label: text(unterknoten(r, "label")), uuid: text(unterknoten(r, "uuid")), ziel: text(unterknoten(r, "targetType")) }));
        felder.push({
          gruppe: gruppe.label || "",
          id: feld.attributeID || "",
          name: feld.name || "",
          typ: feld.dataType || "",
          art: feld.$type || "",
          wert: text(feld) || text(unterknoten(feld, "value")),
          referenzen
        });
      }
    }
  }
  return felder;
}

// Beschreibung eines Schritts: nur das Beschreibungsfeld (Patrick, 24.11.2026), keine anderen Textfelder
export function pictureBeschreibung(bo) {
  return pictureFelder(bo)
    .filter((f) => f.typ !== "color" && f.wert && (/beschreibung|description/i.test(f.id) || /^beschreibung$/i.test(f.name.trim())))
    .map((f) => f.wert)
    .join("\n\n");
}

// Name des Modells, auf das eine Aufrufaktivität in PICTURE verweist (leer, wenn keine Verknüpfung)
export function pictureAufrufZiel(bo) {
  const link = pictureFelder(bo).find((f) => /processLink/i.test(f.id));
  return (link && link.referenzen.map((r) => r.label).find(Boolean)) || "";
}

// Teilprozess-ID -> Prozess mit dem Inhalt aus dem verknüpften Diagramm
export function pictureTeilprozesse(definitions) {
  const ergebnis = new Map();
  const wurzeln = definitions.rootElements || [];
  const prozesse = wurzeln.filter((r) => r.$type === "bpmn:Process");
  const kollaborationen = wurzeln.filter((r) => r.$type === "bpmn:Collaboration");

  // Element-ID -> Prozess, zu dem es gehört (auch in Teilprozessen und Bahnen)
  const prozessVon = new Map();
  const merke = (container, prozess) => {
    for (const el of container.flowElements || []) {
      prozessVon.set(el.id, prozess);
      if (el.flowElements) merke(el, prozess);
    }
  };
  for (const p of prozesse) {
    merke(p, p);
    for (const ls of p.laneSets || []) for (const lane of ls.lanes || []) prozessVon.set(lane.id, p);
  }
  for (const k of kollaborationen) for (const t of k.participants || []) if (t.processRef) prozessVon.set(t.id, t.processRef);

  // Diagramm -> der eine Prozess, den es zeigt
  const prozessImDiagramm = new Map();
  for (const d of definitions.diagrams || []) {
    const gezeigt = new Set();
    for (const form of (d.plane && d.plane.planeElement) || []) {
      const p = form.bpmnElement && prozessVon.get(form.bpmnElement.id);
      if (p) gezeigt.add(p);
    }
    if (gezeigt.size === 1) prozessImDiagramm.set(d.id, [...gezeigt][0]);
  }

  const besuche = (container) => {
    for (const el of container.flowElements || []) {
      if (el.$type === "bpmn:SubProcess") {
        const link = pictureFelder(el).find((f) => f.id === "subDiagramLink");
        const uuid = link && link.referenzen.map((r) => r.uuid).find(Boolean);
        if (uuid) {
          const diagramm = (definitions.diagrams || []).find((d) => d.id === uuid || d.id === `DIAGRAM_${uuid}` || String(d.id).endsWith(uuid));
          const inhalt = diagramm && prozessImDiagramm.get(diagramm.id);
          if (inhalt && inhalt !== prozessVon.get(el.id)) ergebnis.set(el.id, inhalt);
        }
      }
      if (el.flowElements) besuche(el);
    }
  };
  for (const p of prozesse) besuche(p);
  return ergebnis;
}
