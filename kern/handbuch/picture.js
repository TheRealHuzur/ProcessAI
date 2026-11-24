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

const ENTITAETEN = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

// Formatierter Text aus PICTURE (HTML) als schlichter Text; Aufzählungen als " - " mit Einrückung je Ebene
export function htmlZuText(html) {
  let ebene = 0;
  let text = String(html || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*(\/?)\s*(ul|ol|li|p|div|h\d)\b[^>]*>/gi, (_, zu, tag) => {
      tag = tag.toLowerCase();
      if (tag === "ul" || tag === "ol") { ebene = Math.max(0, ebene + (zu ? -1 : 1)); return "\n"; }
      if (tag === "li") return zu ? "\n" : `\n${" ".repeat(ebene)}- `;
      return zu ? "\n" : (ebene ? "" : "\n");
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITAETEN[e.toLowerCase()] ?? m;
    });
  // Listenpunkt direkt nach seinem Absatz-Tag: "- \n" zu "- " zusammenziehen
  text = text.replace(/(^|\n)(\s*- )\n+/g, "$1$2");
  return text.split("\n").map((z) => z.replace(/\s+$/, "")).join("\n")
    .replace(/\n{2,}(?=\s*- )/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/\s+$/, "");
}

// Beschreibung eines Schritts: nur das Beschreibungsfeld (Patrick, 24.11.2026), keine anderen Textfelder.
// PICTURE schreibt denselben Text auch schlicht ins BPMN-Feld documentation; das hat Vorrang (lesen.js).
export function pictureBeschreibung(bo) {
  return pictureFelder(bo)
    .filter((f) => f.typ !== "color" && f.wert && (/beschreibung|description/i.test(f.id) || /^beschreibung$/i.test(f.name.trim())))
    .map((f) => (f.typ === "richtext" || /<\w/.test(f.wert) ? htmlZuText(f.wert) : f.wert))
    .filter(Boolean)
    .join("\n\n");
}

// Teilprozess mit Verknüpfung auf ein Unterdiagramm (ob es in der Datei liegt, prüft pictureTeilprozesse)
export function pictureHatUnterdiagramm(bo) {
  return pictureFelder(bo).some((f) => f.id === "subDiagramLink" && f.referenzen.some((r) => r.uuid));
}

// Name des Modells, auf das eine Aufrufaktivität in PICTURE verweist (leer, wenn keine Verknüpfung)
export function pictureAufrufZiel(bo) {
  const link = pictureFelder(bo).find((f) => /processLink/i.test(f.id));
  return (link && link.referenzen.map((r) => r.label).find(Boolean)) || "";
}

// Diagramm -> der eine Prozess, den es zeigt (über Pool, Bahnen oder Schritte). Schlüssel sind die
// eingelesenen Objekte, nicht die IDs: Beim Zusammenführen mehrerer Dateien können IDs doppelt sein.
export function prozesseDerDiagramme(definitions) {
  const wurzeln = definitions.rootElements || [];
  const prozessVon = new Map();
  const merke = (container, prozess) => {
    for (const el of container.flowElements || []) {
      prozessVon.set(el, prozess);
      if (el.flowElements) merke(el, prozess);
    }
  };
  for (const p of wurzeln.filter((r) => r.$type === "bpmn:Process")) {
    merke(p, p);
    for (const ls of p.laneSets || []) for (const lane of ls.lanes || []) prozessVon.set(lane, p);
  }
  for (const k of wurzeln.filter((r) => r.$type === "bpmn:Collaboration")) {
    for (const t of k.participants || []) if (t.processRef) prozessVon.set(t, t.processRef);
  }
  const ergebnis = new Map();
  for (const d of definitions.diagrams || []) {
    const gezeigt = new Set();
    for (const form of (d.plane && d.plane.planeElement) || []) {
      const p = form.bpmnElement && prozessVon.get(form.bpmnElement);
      if (p) gezeigt.add(p);
    }
    if (gezeigt.size === 1) ergebnis.set(d, [...gezeigt][0]);
  }
  return { prozessVon, prozessImDiagramm: ergebnis };
}

// Teilprozess (Objekt) -> Prozess mit dem Inhalt aus dem verknüpften Diagramm, auch über Dateigrenzen
export function pictureTeilprozesse(definitions) {
  const ergebnis = new Map();
  const prozesse = (definitions.rootElements || []).filter((r) => r.$type === "bpmn:Process");
  const { prozessVon, prozessImDiagramm } = prozesseDerDiagramme(definitions);

  const besuche = (container) => {
    for (const el of container.flowElements || []) {
      if (el.$type === "bpmn:SubProcess") {
        const link = pictureFelder(el).find((f) => f.id === "subDiagramLink");
        const uuid = link && link.referenzen.map((r) => r.uuid).find(Boolean);
        if (uuid) {
          const diagramm = (definitions.diagrams || []).find((d) => d.id === uuid || d.id === `DIAGRAM_${uuid}` || String(d.id).endsWith(uuid));
          const inhalt = diagramm && prozessImDiagramm.get(diagramm);
          if (inhalt && inhalt !== prozessVon.get(el)) ergebnis.set(el, inhalt);
        }
      }
      if (el.flowElements) besuche(el);
    }
  };
  for (const p of prozesse) besuche(p);
  return ergebnis;
}
