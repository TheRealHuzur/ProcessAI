// ProzessPilot: Oberfläche
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    canvas: $("canvas"),
    leerHinweis: $("leer-hinweis"),
    prozessname: $("prozessname"),
    quelltext: $("quelltext"),
    zaehler: $("quelltext-zaehler"),
    modell: $("modell"),
    erzeugen: $("btn-erzeugen"),
    fortschritt: $("fortschritt"),
    mikro: $("btn-mikro"),
    mikroText: $("mikro-text"),
    mikroStatus: $("mikro-status"),
    ergebnis: $("ergebnis"),
    zusammenfassung: $("ergebnis-zusammenfassung"),
    listeFehler: $("liste-fehler"),
    listeHinweise: $("liste-hinweise"),
    blockUnklar: $("block-unklarheiten"),
    listeUnklar: $("liste-unklarheiten"),
    blockNicht: $("block-nicht-modelliert"),
    listeNicht: $("liste-nicht-modelliert"),
    modeToggle: $("mode-toggle"),
    editorStatus: $("editor-status"),
    panelElement: $("panel-element"),
    elementTyp: $("element-typ"),
    elementName: $("element-name"),
    elementBeschreibung: $("element-beschreibung"),
    elementWissen: $("element-wissen"),
    elementId: $("element-id"),
    dialogProzesse: $("dialog-prozesse"),
    prozessListe: $("prozess-liste"),
    dialogLogin: $("dialog-login"),
    formLogin: $("form-login"),
    loginPasswort: $("login-passwort"),
    loginFehler: $("login-fehler"),
    fileInput: $("file-input"),
    toasts: $("toast-container"),
    befehl: $("befehl"),
    befehlAusfuehren: $("btn-befehl"),
    befehlMikro: $("btn-befehl-mikro"),
    befehlFortschritt: $("befehl-fortschritt"),
    befehlBezug: $("befehl-bezug"),
    befehlBezugText: $("befehl-bezug-text"),
    rueckgaengig: $("btn-rueckgaengig"),
    blockAenderungen: $("block-aenderungen"),
    listeAenderungen: $("liste-aenderungen")
  };

  const LEER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="https://prozesspilot.wissen-und-werkzeug.de/schema">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="180" y="180" width="36" height="36" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  const TYP_NAMEN = {
    "bpmn:StartEvent": "Startereignis",
    "bpmn:IntermediateCatchEvent": "Zwischenereignis",
    "bpmn:IntermediateThrowEvent": "Zwischenereignis (sendend)",
    "bpmn:EndEvent": "Endereignis",
    "bpmn:Task": "Aufgabe",
    "bpmn:SubProcess": "Teilprozess",
    "bpmn:ExclusiveGateway": "Exklusives Gateway (XOR)",
    "bpmn:ParallelGateway": "Paralleles Gateway (AND)",
    "bpmn:EventBasedGateway": "Ereignisbasiertes Gateway",
    "bpmn:DataObjectReference": "Datenobjekt",
    "bpmn:DataStoreReference": "Datenspeicher",
    "bpmn:Participant": "Pool",
    "bpmn:Lane": "Schwimmbahn",
    "bpmn:SequenceFlow": "Sequenzfluss",
    "bpmn:MessageFlow": "Nachrichtenfluss"
  };

  const state = {
    modeler: null,
    mode: "basis",
    prozessId: null,
    // Gespeicherte Version, für das Deckblatt des Handbuchs
    version: null,
    letzteErzeugung: null,
    dirty: false,
    markierungen: [],
    ausgewaehlt: null,
    wechselt: false,
    kiLaeuft: false,
    // Offene Fragen der KI zum aktuellen Modell; gehen bei jeder Änderung wieder an die KI
    fragen: { unklarheiten: [], nichtModelliert: [] },
    letztesErgebnis: null,
    // Stände vor KI-Änderungen für "Rückgängig"
    verlauf: [],
    // Anweisungen seit dem letzten Speichern, landen in der Notiz der Version
    befehle: [],
    bezugFrage: null,
    sprachZiel: "quelltext",
    befehlNachStopp: false,
    erzeugenNachStopp: false,
    // Gewählte Spracherkennung (Server oder Browser), gesetzt in richteSpracheEin
    sprache: null
  };

  const MAX_VERLAUF = 10;

  // ---------- Hilfen ----------

  function toast(text, type = "info") {
    const t = document.createElement("div");
    t.className = "toast";
    t.dataset.type = type;
    t.textContent = text;
    el.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add("is-leaving");
      setTimeout(() => t.remove(), 220);
    }, type === "error" ? 8000 : 4500);
  }

  async function api(pfad, { method = "GET", body } = {}) {
    const res = await fetch(pfad, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
    let daten = null;
    try {
      daten = await res.json();
    } catch {
      daten = null;
    }
    if (res.status === 401 && pfad !== "/api/anmelden") {
      zeigeLogin();
    }
    if (!res.ok) {
      const fehler = new Error((daten && daten.fehler) || `Fehler ${res.status}`);
      fehler.status = res.status;
      throw fehler;
    }
    return daten;
  }

  function speicherLesen(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function speicherSchreiben(key, wert) {
    try {
      window.localStorage.setItem(key, wert);
    } catch {
      /* Browser-Speicher nicht verfügbar */
    }
  }

  function download(inhalt, typ, dateiname) {
    const blob = new Blob([inhalt], { type: typ });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function dateiname(endung) {
    const basis = (el.prozessname.value.trim() || "prozess").toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${basis || "prozess"}.${endung}`;
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function setDirty(wert) {
    state.dirty = wert;
    el.editorStatus.textContent = wert ? "Ungespeicherte Änderungen" : (state.prozessId ? "Gespeichert" : "");
    if (wert) modellEntwurfPlanen();
    else modellEntwurfVerwerfen();
  }

  // Ungespeichertes Modell laufend im Browser sichern, damit nach Absturz oder Neuladen nichts verloren geht
  let modellSicherung = null;

  function modellEntwurfPlanen() {
    clearTimeout(modellSicherung);
    modellSicherung = setTimeout(async () => {
      if (!state.dirty || !el.leerHinweis.hidden || !state.modeler) return;
      try {
        speicherSchreiben("pp.modellEntwurf", JSON.stringify({ xml: await aktuellesXml(), prozessId: state.prozessId, zeit: new Date().toISOString() }));
      } catch {
        /* nächster Versuch bei der nächsten Änderung */
      }
    }, 1500);
  }

  function modellEntwurfVerwerfen() {
    clearTimeout(modellSicherung);
    try {
      window.localStorage.removeItem("pp.modellEntwurf");
    } catch {
      /* Browser-Speicher nicht verfügbar */
    }
  }

  function modellEntwurfLesen() {
    try {
      const entwurf = JSON.parse(speicherLesen("pp.modellEntwurf") || "null");
      return entwurf && entwurf.xml ? entwurf : null;
    } catch {
      return null;
    }
  }

  // Zeitbasierte Fortschrittsanzeige für KI-Aufrufe; gibt eine Funktion zum Beenden zurück
  function starteFortschritt(feld, meldungen) {
    const beginn = Date.now();
    feld.hidden = false;
    feld.textContent = meldungen[0];
    const timer = setInterval(() => {
      const s = Math.round((Date.now() - beginn) / 1000);
      feld.textContent = `${meldungen[Math.min(Math.floor(s / 12), meldungen.length - 1)]} (${s} s)`;
    }, 500);
    return () => {
      clearInterval(timer);
      feld.hidden = true;
    };
  }

  function kiSperren(an) {
    state.kiLaeuft = an;
    el.erzeugen.disabled = an;
    el.befehlAusfuehren.disabled = an;
  }

  // ---------- Editor ----------

  function bindeModelerEvents(modeler) {
    const eventBus = modeler.get("eventBus");
    eventBus.on("commandStack.changed", () => {
      setDirty(true);
      verbergeLeerHinweis();
      aktualisiereWissenMarker();
    });
    eventBus.on("import.done", () => aktualisiereWissenMarker());
    eventBus.on("selection.changed", ({ newSelection }) => {
      zeigeElementPanel(newSelection.length === 1 ? newSelection[0] : null);
    });
    eventBus.on("element.changed", ({ element }) => {
      if (state.ausgewaehlt && element.id === state.ausgewaehlt.id) {
        fuellePanel(element, { nurWennNichtFokussiert: true });
      }
    });
  }

  async function erstelleModeler(mode, xml) {
    if (state.modeler) state.modeler.destroy();
    el.canvas.innerHTML = "";
    state.modeler = window.PPEditor.createModeler(el.canvas, mode);
    state.mode = mode;
    bindeModelerEvents(state.modeler);
    aktualisiereModeButtons();
    await importiere(xml);
  }

  async function importiere(xml) {
    zeigeElementPanel(null);
    const result = await state.modeler.importXML(xml);
    state.markierungen = [];
    const canvas = state.modeler.get("canvas");
    canvas.zoom("fit-viewport", "auto");
    // Platz für die Palette links lassen
    const vb = canvas.viewbox();
    const rand = 170 / vb.scale;
    canvas.viewbox({ x: vb.x - rand, y: vb.y - 20 / vb.scale, width: vb.width + rand, height: vb.height + 40 / vb.scale });
    if (result.warnings && result.warnings.length) {
      console.warn("Import-Warnungen", result.warnings);
    }
    return result;
  }

  async function aktuellesXml() {
    const { xml } = await state.modeler.saveXML({ format: true });
    return xml;
  }

  function aktualisiereModeButtons() {
    el.modeToggle.querySelectorAll("button").forEach((b) => {
      const aktiv = b.dataset.mode === state.mode;
      b.classList.toggle("is-active", aktiv);
      b.classList.toggle("btn-secondary", !aktiv);
      b.setAttribute("aria-pressed", String(aktiv));
      b.disabled = state.wechselt;
    });
  }

  function baueModeButtons() {
    for (const mode of window.PPEditor.MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-secondary";
      b.dataset.mode = mode;
      b.textContent = window.PPEditor.MODE_LABELS[mode];
      b.addEventListener("click", () => wechsleModus(mode));
      el.modeToggle.appendChild(b);
    }
  }

  async function wechsleModus(mode) {
    if (mode === state.mode || state.wechselt) return;
    state.wechselt = true;
    aktualisiereModeButtons();
    try {
      const xml = await aktuellesXml();
      const warDirty = state.dirty;
      await erstelleModeler(mode, xml);
      setDirty(warDirty);
    } catch (error) {
      console.error(error);
      toast("Modus konnte nicht gewechselt werden.", "error");
    } finally {
      state.wechselt = false;
      aktualisiereModeButtons();
    }
  }

  function verbergeLeerHinweis() {
    el.leerHinweis.hidden = true;
  }

  function setzeMarkierungen(fehler, hinweise, aenderung) {
    const canvas = state.modeler.get("canvas");
    const registry = state.modeler.get("elementRegistry");
    for (const { id, klasse } of state.markierungen) {
      if (registry.get(id)) canvas.removeMarker(id, klasse);
    }
    state.markierungen = [];
    const setze = (liste, klasse) => {
      for (const befund of liste) {
        if (befund.element && registry.get(befund.element)) {
          canvas.addMarker(befund.element, klasse);
          state.markierungen.push({ id: befund.element, klasse });
        }
      }
    };
    if (aenderung) {
      setze(aenderung.neu.map((id) => ({ element: id })), "pp-neu");
      setze(aenderung.geaendert.map((id) => ({ element: id })), "pp-geaendert");
    }
    setze(hinweise, "pp-hinweis");
    setze(fehler, "pp-fehler");
  }

  function springeZu(elementId) {
    const registry = state.modeler.get("elementRegistry");
    const element = registry.get(elementId);
    if (!element) return;
    state.modeler.get("selection").select(element);
    try {
      state.modeler.get("canvas").scrollToElement(element);
    } catch {
      /* ältere Version ohne scrollToElement */
    }
  }

  // ---------- Element-Panel (Name und Beschreibung) ----------

  function istBearbeitbar(element) {
    if (!element || element.labelTarget) return false;
    const typ = element.businessObject && element.businessObject.$type;
    return Boolean(typ) && typ !== "bpmn:Process" && typ !== "bpmn:Collaboration";
  }

  function zeigeElementPanel(element) {
    if (!istBearbeitbar(element)) {
      state.ausgewaehlt = null;
      el.panelElement.hidden = true;
      aktualisiereBezug();
      return;
    }
    state.ausgewaehlt = element;
    fuellePanel(element, {});
    el.panelElement.hidden = false;
    aktualisiereBezug();
  }

  // Weitere Angaben (Dokumente, Ansprechpersonen, Rechtsgrundlagen) nur an Aktivitäten
  function istAktivitaet(element) {
    const bo = element && element.businessObject;
    return Boolean(bo && bo.$instanceOf && bo.$instanceOf("bpmn:Activity"));
  }

  function baueWissenFelder() {
    el.wissenFelder = {};
    for (const f of window.PPWissen.FELDER) {
      const label = document.createElement("label");
      label.className = "field-label";
      label.htmlFor = `element-wissen-${f.key}`;
      label.textContent = f.titel;
      const feld = document.createElement("textarea");
      feld.className = "input textarea textarea-wissen";
      feld.id = `element-wissen-${f.key}`;
      feld.rows = 2;
      feld.placeholder = f.key === "ansprechpersonen" ? "Eine Rolle je Zeile, kein Name" : "Eine Angabe je Zeile";
      feld.addEventListener("input", uebernehmeWissen);
      el.elementWissen.append(label, feld);
      el.wissenFelder[f.key] = feld;
    }
  }

  function fuellePanel(element, { nurWennNichtFokussiert }) {
    const bo = element.businessObject;
    el.elementTyp.textContent = TYP_NAMEN[bo.$type] || bo.$type.replace("bpmn:", "");
    el.elementId.textContent = `ID: ${bo.id}`;
    if (!(nurWennNichtFokussiert && document.activeElement === el.elementName)) {
      el.elementName.value = bo.name || "";
    }
    if (!(nurWennNichtFokussiert && document.activeElement === el.elementBeschreibung)) {
      el.elementBeschreibung.value = (bo.documentation || []).map((d) => d.text || "").join("\n\n");
    }
    el.elementWissen.hidden = !istAktivitaet(element);
    if (!el.elementWissen.hidden) {
      const wissen = window.PPWissen.lesen(bo);
      for (const f of window.PPWissen.FELDER) {
        const feld = el.wissenFelder[f.key];
        if (nurWennNichtFokussiert && document.activeElement === feld) continue;
        feld.value = wissen[f.key].join("\n");
      }
    }
  }

  const uebernehmeName = debounce(() => {
    const element = state.ausgewaehlt;
    if (!element) return;
    const neu = el.elementName.value;
    if ((element.businessObject.name || "") === neu) return;
    state.modeler.get("modeling").updateLabel(element, neu);
  }, 350);

  const uebernehmeBeschreibung = debounce(() => {
    const element = state.ausgewaehlt;
    if (!element) return;
    const text = el.elementBeschreibung.value;
    const alt = (element.businessObject.documentation || []).map((d) => d.text || "").join("\n\n");
    if (alt === text) return;
    const moddle = state.modeler.get("moddle");
    const documentation = text.trim() ? [moddle.create("bpmn:Documentation", { text })] : [];
    state.modeler.get("modeling").updateProperties(element, { documentation });
  }, 450);

  const uebernehmeWissen = debounce(() => {
    const element = state.ausgewaehlt;
    if (!element || !istAktivitaet(element)) return;
    const { PPWissen } = window;
    const bo = element.businessObject;
    const neu = Object.fromEntries(PPWissen.FELDER.map((f) => [f.key, PPWissen.zeilen(el.wissenFelder[f.key].value)]));
    if (JSON.stringify(neu) === JSON.stringify(PPWissen.lesen(bo))) return;
    const extensionElements = PPWissen.alsExtensionElements(state.modeler.get("moddle"), bo, neu);
    state.modeler.get("modeling").updateProperties(element, { extensionElements });
  }, 450);

  // Kleines Buch-Symbol an jeder Aktivität mit Arbeitshilfe oder weiteren Angaben; Klick öffnet sie
  function hatWissen(bo) {
    const arbeitshilfe = (bo.documentation || []).some((d) => (d.text || "").trim());
    return arbeitshilfe || !window.PPWissen.istLeer(window.PPWissen.lesen(bo));
  }

  const aktualisiereWissenMarker = debounce(() => {
    if (!state.modeler) return;
    const overlays = state.modeler.get("overlays");
    overlays.remove({ type: "pp-wissen" });
    for (const element of state.modeler.get("elementRegistry").getAll()) {
      // Ohne parent: Ebene eines aufgeklappten Teilprozesses, kein Symbol im Diagramm
      if (!element.parent || element.labelTarget || !istAktivitaet(element) || !hatWissen(element.businessObject)) continue;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "pp-wissen-marker";
      marker.title = "Arbeitshilfe ansehen";
      marker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path><path d="M5 17a3 3 0 0 1 3-3h9"></path></svg>';
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        state.modeler.get("selection").select(element);
        el.elementBeschreibung.focus();
      });
      overlays.add(element, "pp-wissen", { position: { bottom: 20, right: 22 }, html: marker });
    }
  }, 150);

  // ---------- Ergebnis anzeigen ----------

  function befundElement(text, art, { regel, element } = {}) {
    const li = document.createElement("li");
    li.className = "befund";
    li.dataset.art = art;
    if (regel) {
      const r = document.createElement("span");
      r.className = "regel";
      r.textContent = regel;
      li.appendChild(r);
    }
    li.appendChild(document.createTextNode(text));
    if (element) {
      li.dataset.element = element;
      li.title = "Im Modell zeigen";
      li.addEventListener("click", () => springeZu(element));
    }
    return li;
  }

  function zeigeAenderungen(aenderung) {
    if (!aenderung) {
      el.blockAenderungen.hidden = true;
      return;
    }
    const eintraege = aenderung.texte.map((t) => befundElement(t, "aenderung"));
    if (eintraege.length === 0) {
      eintraege.push(befundElement(`${aenderung.neu.length} neu, ${aenderung.geaendert.length} geändert (im Modell markiert).`, "aenderung"));
    }
    for (const e of aenderung.entfernt) {
      if (!e.name && (e.art === "Sequenzfluss" || e.art === "Nachrichtenfluss")) continue;
      eintraege.push(befundElement(`Entfernt: ${e.art} „${e.name || e.id}“`, "entfernt"));
    }
    eintraege.push(befundElement("Grün ist neu, lila ist geändert.", "frage"));
    el.listeAenderungen.replaceChildren(...eintraege);
    el.blockAenderungen.hidden = false;
  }

  function zeigeErgebnis(ergebnis) {
    const { pruefung, unklarheiten, nichtModelliert, korrigiert, modell, dauerMs } = ergebnis;
    state.letztesErgebnis = ergebnis;
    zeigeAenderungen(ergebnis.aenderung);
    el.listeFehler.replaceChildren(...pruefung.fehler.map((f) => befundElement(f.text, "fehler", f)));
    el.listeHinweise.replaceChildren(...pruefung.hinweise.map((h) => befundElement(h.text, "hinweis", h)));
    el.listeUnklar.replaceChildren(...unklarheiten.map((u) => {
      const li = befundElement(u, "frage");
      li.dataset.antworten = "";
      li.title = "Antworten: per Sprache oder Text in der Zeile über dem Modell";
      li.addEventListener("click", () => setzeBezugFrage(u));
      return li;
    }));
    el.listeNicht.replaceChildren(...nichtModelliert.map((n) => befundElement(n, "frage")));
    el.blockUnklar.hidden = unklarheiten.length === 0;
    el.blockNicht.hidden = nichtModelliert.length === 0;

    const teile = [];
    if (pruefung.fehler.length === 0) {
      teile.push(`<span class="ok-badge">Keine Regelverstöße.</span>`);
    } else {
      teile.push(`${pruefung.fehler.length} Regelverstoß${pruefung.fehler.length === 1 ? "" : "e"} offen.`);
    }
    if (pruefung.hinweise.length) teile.push(`${pruefung.hinweise.length} Hinweis${pruefung.hinweise.length === 1 ? "" : "e"} zur Benennung.`);
    if (korrigiert) teile.push("Die KI hat ihren ersten Entwurf nach dem Regelcheck einmal korrigiert.");
    const sekunden = Math.round((dauerMs || 0) / 1000);
    const modellLabel = el.modell.querySelector(`option[value="${CSS.escape(modell || "")}"]`);
    teile.push(`<span class="muted">${modellLabel ? modellLabel.textContent : modell}, ${sekunden} s</span>`);
    el.zusammenfassung.innerHTML = teile.join(" ");
    el.ergebnis.hidden = false;
  }

  // ---------- Aktionen ----------

  async function modellErzeugen() {
    const sprache = state.sprache;
    if (sprache && sprache.beschaeftigt && !state.kiLaeuft) {
      // Server-Erkennung: erst die letzten Abschnitte abwarten, danach geht es von selbst weiter
      state.erzeugenNachStopp = true;
      if (sprache.aktiv) sprache.stop();
      return;
    }
    const text = el.quelltext.value.trim();
    if (text.length < 20) {
      toast("Bitte zuerst den Prozess einsprechen oder beschreiben.", "error");
      el.quelltext.focus();
      return;
    }
    if (state.kiLaeuft) return;
    if (sprache && sprache.aktiv) sprache.stop();
    if (state.dirty && el.leerHinweis.hidden && !window.confirm("Das aktuelle Modell wird durch den neuen Entwurf ersetzt. Weiter?")) {
      return;
    }

    kiSperren(true);
    const fortschrittEnde = starteFortschritt(el.fortschritt, ["Die KI liest die Beschreibung …", "Die KI entwirft das Modell …", "Regelcheck läuft …", "Fast fertig …"]);

    try {
      const ergebnis = await api("/api/erzeugen", {
        method: "POST",
        body: { text, prozessname: el.prozessname.value.trim(), modell: el.modell.value }
      });
      await merkeStand();
      await importiere(ergebnis.xml);
      verbergeLeerHinweis();
      if (!el.prozessname.value.trim() && ergebnis.prozessname) {
        el.prozessname.value = ergebnis.prozessname;
        entwurfSichern();
      }
      setzeMarkierungen(ergebnis.pruefung.fehler, ergebnis.pruefung.hinweise);
      zeigeErgebnis(ergebnis);
      state.fragen = { unklarheiten: ergebnis.unklarheiten, nichtModelliert: ergebnis.nichtModelliert };
      state.letzteErzeugung = { kiModell: ergebnis.modell, kiJson: ergebnis.modellJson, pruefung: ergebnis.pruefung };
      state.befehle = [];
      setDirty(true);
      toast("Modell erzeugt. Bitte prüfen.", "ok");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      fortschrittEnde();
      kiSperren(false);
    }
  }

  // ---------- Ändern per Sprachbefehl oder Text ----------

  function aktualisiereBezug() {
    let text = "";
    if (state.bezugFrage) {
      text = `Antwort auf: ${state.bezugFrage}`;
    } else if (state.ausgewaehlt) {
      const bo = state.ausgewaehlt.businessObject;
      text = `Bezieht sich auf: ${bo.name || TYP_NAMEN[bo.$type] || bo.id}`;
    }
    el.befehlBezugText.textContent = text;
    el.befehlBezug.title = text;
    el.befehlBezug.hidden = !text;
  }

  function setzeBezugFrage(frage) {
    state.bezugFrage = frage;
    aktualisiereBezug();
    el.befehl.focus();
  }

  function bezugEntfernen() {
    if (state.bezugFrage) {
      state.bezugFrage = null;
      aktualisiereBezug();
    } else {
      state.modeler.get("selection").select([]);
    }
  }

  function bezugFuerKi() {
    if (state.bezugFrage) return { frage: state.bezugFrage };
    if (state.ausgewaehlt) {
      const bo = state.ausgewaehlt.businessObject;
      return { elementId: bo.id, elementName: bo.name || TYP_NAMEN[bo.$type] || "" };
    }
    return {};
  }

  async function merkeStand() {
    if (!el.leerHinweis.hidden) return;
    state.verlauf.push({
      xml: await aktuellesXml(),
      ergebnis: state.letztesErgebnis,
      fragen: state.fragen,
      letzteErzeugung: state.letzteErzeugung,
      befehle: [...state.befehle]
    });
    if (state.verlauf.length > MAX_VERLAUF) state.verlauf.shift();
    el.rueckgaengig.hidden = false;
  }

  function verlaufLeeren() {
    state.verlauf = [];
    state.befehle = [];
    state.bezugFrage = null;
    state.fragen = { unklarheiten: [], nichtModelliert: [] };
    state.letztesErgebnis = null;
    el.rueckgaengig.hidden = true;
    aktualisiereBezug();
  }

  async function rueckgaengig() {
    const stand = state.verlauf.pop();
    if (!stand || state.kiLaeuft) return;
    try {
      await importiere(stand.xml);
      verbergeLeerHinweis();
      state.fragen = stand.fragen;
      state.letzteErzeugung = stand.letzteErzeugung;
      state.befehle = stand.befehle;
      if (stand.ergebnis) {
        zeigeErgebnis(stand.ergebnis);
        setzeMarkierungen(stand.ergebnis.pruefung.fehler, stand.ergebnis.pruefung.hinweise);
      } else {
        state.letztesErgebnis = null;
        el.ergebnis.hidden = true;
      }
      setDirty(true);
      toast("Stand vor der letzten KI-Änderung wiederhergestellt.");
    } catch (error) {
      console.error(error);
      toast("Rückgängig hat nicht geklappt.", "error");
    } finally {
      el.rueckgaengig.hidden = state.verlauf.length === 0;
    }
  }

  async function befehlAusfuehren() {
    if (state.kiLaeuft) return;
    const sprache = state.sprache;
    if (sprache && (sprache.aktiv || sprache.beschaeftigt) && state.sprachZiel === "befehl") {
      // Erst die Aufnahme sauber beenden, danach geht es von selbst weiter
      state.befehlNachStopp = true;
      if (sprache.aktiv) sprache.stop();
      return;
    }
    const anweisung = el.befehl.value.trim();
    if (anweisung.length < 3) {
      toast("Bitte sag oder schreib, was sich ändern soll.", "error");
      el.befehl.focus();
      return;
    }
    if (!el.leerHinweis.hidden) {
      toast("Es gibt noch kein Modell. Erst den Prozess einsprechen und das Modell erzeugen.", "error");
      return;
    }
    const { modell, abweichungen } = window.PPModellLesen.lesen(state.modeler.getDefinitions());
    if (!modell || modell.elemente.length === 0) {
      toast("Es gibt noch kein Modell, das geändert werden kann.", "error");
      return;
    }
    if (abweichungen.length && !window.confirm(`Beim Ändern durch die KI gilt:\n\n- ${abweichungen.join("\n- ")}\n\nTrotzdem ändern?`)) {
      return;
    }
    modell.unklarheiten = state.fragen.unklarheiten;
    modell.nicht_modelliert = state.fragen.nichtModelliert;

    kiSperren(true);
    const fortschrittEnde = starteFortschritt(el.befehlFortschritt, ["Die KI liest die Änderung …", "Die KI ändert das Modell …", "Regelcheck läuft …", "Fast fertig …"]);
    let rueckfrage = "";
    try {
      const ergebnis = await api("/api/aendern", {
        method: "POST",
        body: { prozess: modell, anweisung, bezug: bezugFuerKi(), modell: el.modell.value }
      });
      if (ergebnis.aenderung.unveraendert) {
        rueckfrage = ergebnis.aenderung.rueckfrage
          ? `Rückfrage der KI: ${ergebnis.aenderung.rueckfrage}`
          : "Die KI hat nichts geändert. Bitte die Anweisung genauer fassen.";
        return;
      }
      await merkeStand();
      await importiere(ergebnis.xml);
      verbergeLeerHinweis();
      state.fragen = { unklarheiten: ergebnis.unklarheiten, nichtModelliert: ergebnis.nichtModelliert };
      state.letzteErzeugung = { kiModell: ergebnis.modell, kiJson: ergebnis.modellJson, pruefung: ergebnis.pruefung };
      state.befehle.push(anweisung);
      state.bezugFrage = null;
      aktualisiereBezug();
      setzeMarkierungen(ergebnis.pruefung.fehler, ergebnis.pruefung.hinweise, ergebnis.aenderung);
      zeigeErgebnis(ergebnis);
      el.befehl.value = "";
      setDirty(true);
      toast(ergebnis.aenderung.rueckfrage ? `Geändert. Rückfrage der KI: ${ergebnis.aenderung.rueckfrage}` : "Modell geändert. Grün ist neu, lila ist geändert.", "ok");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      fortschrittEnde();
      kiSperren(false);
      if (rueckfrage) {
        el.befehlFortschritt.textContent = rueckfrage;
        el.befehlFortschritt.hidden = false;
      }
    }
  }

  async function speichern() {
    try {
      const bpmnXml = await aktuellesXml();
      const body = {
        prozessId: state.prozessId,
        name: el.prozessname.value.trim() || "Neuer Prozess",
        bpmnXml,
        quelltext: el.quelltext.value,
        notiz: state.befehle.length ? `Geändert per Anweisung: ${state.befehle.join(" | ")}` : "",
        ...(state.letzteErzeugung || {})
      };
      const ergebnis = await api("/api/prozesse", { method: "POST", body });
      state.prozessId = ergebnis.id;
      state.version = ergebnis.version;
      state.letzteErzeugung = null;
      state.befehle = [];
      speicherSchreiben("pp.prozessId", ergebnis.id);
      setDirty(false);
      toast(`Gespeichert als Version ${ergebnis.version}.`, "ok");
    } catch (error) {
      if (error.status !== 401) toast(`Speichern fehlgeschlagen: ${error.message}`, "error");
    }
  }

  async function ladeProzess(id, { felderBehalten = false } = {}) {
    try {
      const prozess = await api(`/api/prozesse/${encodeURIComponent(id)}`);
      if (!prozess.aktuell) throw new Error("Keine Version vorhanden.");
      await importiere(prozess.aktuell.bpmn_xml);
      verbergeLeerHinweis();
      verlaufLeeren();
      state.fragen = fragenAusKiJson(prozess.aktuell.ki_json);
      state.prozessId = prozess.id;
      state.version = prozess.aktuell.version;
      state.letzteErzeugung = null;
      if (!felderBehalten) {
        el.prozessname.value = prozess.name;
        el.quelltext.value = prozess.aktuell.quelltext || "";
        aktualisiereZaehler();
        entwurfSichern();
      }
      speicherSchreiben("pp.prozessId", prozess.id);
      el.ergebnis.hidden = true;
      setDirty(false);
      toast(`"${prozess.name}" geladen (Version ${prozess.aktuell.version}).`);
    } catch (error) {
      if (error.status !== 401) toast(`Laden fehlgeschlagen: ${error.message}`, "error");
    }
  }

  // Offene Fragen der KI aus der gespeicherten Version, damit sie bei Änderungen erhalten bleiben
  function fragenAusKiJson(kiJson) {
    try {
      const roh = JSON.parse(kiJson || "null");
      const liste = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
      return { unklarheiten: liste(roh && roh.unklarheiten), nichtModelliert: liste(roh && (roh.nicht_modelliert || roh.nichtModelliert)) };
    } catch {
      return { unklarheiten: [], nichtModelliert: [] };
    }
  }

  async function zeigeProzesse() {
    el.prozessListe.innerHTML = `<li class="prozess-leer">Wird geladen …</li>`;
    if (!el.dialogProzesse.open) el.dialogProzesse.showModal();
    try {
      const liste = await api("/api/prozesse");
      if (liste.length === 0) {
        el.prozessListe.innerHTML = `<li class="prozess-leer">Noch keine Prozesse gespeichert.</li>`;
        return;
      }
      el.prozessListe.replaceChildren(...liste.map((p) => {
        const li = document.createElement("li");
        li.className = "prozess-eintrag";
        const oeffnen = document.createElement("button");
        oeffnen.type = "button";
        oeffnen.className = "prozess-oeffnen";
        const name = document.createElement("span");
        name.className = "prozess-name";
        name.textContent = p.name;
        const meta = document.createElement("span");
        meta.className = "prozess-meta";
        meta.textContent = `Version ${p.version || 1}, geändert ${new Date(p.geaendert).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}`;
        oeffnen.append(name, meta);
        oeffnen.addEventListener("click", async () => {
          if (state.dirty && !window.confirm("Ungespeicherte Änderungen gehen verloren. Trotzdem öffnen?")) return;
          el.dialogProzesse.close();
          await ladeProzess(p.id);
        });
        const loeschen = document.createElement("button");
        loeschen.type = "button";
        loeschen.className = "btn btn-ghost btn-icon btn-danger";
        loeschen.title = "Löschen";
        loeschen.setAttribute("aria-label", `${p.name} löschen`);
        loeschen.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"></path></svg>`;
        loeschen.addEventListener("click", async () => {
          if (!window.confirm(`"${p.name}" mit allen Versionen löschen?`)) return;
          try {
            await api(`/api/prozesse/${encodeURIComponent(p.id)}`, { method: "DELETE" });
            if (state.prozessId === p.id) {
              state.prozessId = null;
              setDirty(true);
            }
            zeigeProzesse();
          } catch (error) {
            toast(error.message, "error");
          }
        });
        li.append(oeffnen, loeschen);
        return li;
      }));
    } catch (error) {
      el.prozessListe.innerHTML = "";
      if (error.status !== 401) toast(error.message, "error");
    }
  }

  async function neu() {
    if (state.dirty && !window.confirm("Ungespeicherte Änderungen gehen verloren. Neu beginnen?")) return;
    await importiere(LEER_XML);
    verlaufLeeren();
    state.prozessId = null;
    state.letzteErzeugung = null;
    el.prozessname.value = "";
    el.quelltext.value = "";
    aktualisiereZaehler();
    entwurfSichern();
    speicherSchreiben("pp.prozessId", "");
    el.ergebnis.hidden = true;
    el.leerHinweis.hidden = false;
    setDirty(false);
  }

  function oeffneDatei() {
    el.fileInput.value = "";
    el.fileInput.click();
  }

  el.fileInput.addEventListener("change", () => {
    const [datei] = el.fileInput.files || [];
    if (!datei) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await importiere(String(reader.result || ""));
        verbergeLeerHinweis();
        verlaufLeeren();
        state.prozessId = null;
        state.letzteErzeugung = null;
        const definitions = state.modeler.getDefinitions();
        const prozess = (definitions.rootElements || []).find((r) => r.$type === "bpmn:Process");
        el.prozessname.value = (prozess && prozess.name) || datei.name.replace(/\.(bpmn|xml)$/i, "");
        el.ergebnis.hidden = true;
        setDirty(true);
        toast("Datei geladen. Beim Speichern entsteht ein neuer Prozess.");
      } catch (error) {
        console.error(error);
        toast("Datei konnte nicht geladen werden. Ist es eine gültige BPMN-2.0-Datei?", "error");
      }
    };
    reader.onerror = () => toast("Datei konnte nicht gelesen werden.", "error");
    reader.readAsText(datei);
  });

  async function exportBpmn() {
    try {
      download(await aktuellesXml(), "application/xml;charset=utf-8", dateiname("bpmn"));
    } catch (error) {
      toast("Export fehlgeschlagen.", "error");
    }
  }

  async function exportHandbuch() {
    try {
      const res = await fetch("/api/handbuch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          bpmnXml: await aktuellesXml(),
          name: el.prozessname.value.trim(),
          version: state.prozessId && !state.dirty ? state.version : null
        })
      });
      if (res.status === 401) return zeigeLogin();
      if (!res.ok) {
        const daten = await res.json().catch(() => null);
        throw new Error((daten && daten.fehler) || `Fehler ${res.status}`);
      }
      download(await res.blob(), "application/pdf", dateiname("pdf").replace(/\.pdf$/, "-handbuch.pdf"));
    } catch (error) {
      toast(`Handbuch konnte nicht erstellt werden: ${error.message}`, "error");
    }
  }

  async function exportSvg() {
    try {
      const { svg } = await state.modeler.saveSVG();
      download(svg, "image/svg+xml;charset=utf-8", dateiname("svg"));
    } catch (error) {
      toast("SVG-Export fehlgeschlagen.", "error");
    }
  }

  // ---------- Entwurf laufend sichern ----------

  function aktualisiereZaehler() {
    const n = el.quelltext.value.length;
    el.zaehler.textContent = n ? `(${n.toLocaleString("de-DE")} Zeichen)` : "";
  }

  const entwurfSichern = debounce(() => {
    speicherSchreiben("pp.entwurf", JSON.stringify({ name: el.prozessname.value, text: el.quelltext.value }));
  }, 400);

  function entwurfLaden() {
    const roh = speicherLesen("pp.entwurf");
    if (!roh) return;
    try {
      const entwurf = JSON.parse(roh);
      el.prozessname.value = entwurf.name || "";
      el.quelltext.value = entwurf.text || "";
      aktualisiereZaehler();
    } catch {
      /* ignorieren */
    }
  }

  // ---------- Spracherkennung ----------

  // Eine Spracherkennung, zwei Ziele: die Prozessbeschreibung links oder die Befehlszeile über dem Modell.
  // Mit Whisper auf dem Server (spracheServer) die Server-Erkennung, sonst die des Browsers.
  function richteSpracheEin(server) {
    const aufServer = server ? window.PPSprache.server() : null;
    const sprache = aufServer && aufServer.istVerfuegbar ? aufServer : window.PPSprache.browser();
    state.sprache = sprache;
    if (!sprache.istVerfuegbar) {
      el.mikro.disabled = true;
      el.befehlMikro.disabled = true;
      el.befehlMikro.title = "Spracherkennung wird von diesem Browser nicht unterstützt.";
      el.mikroStatus.textContent = "Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome verwenden oder den Text eintippen.";
      return;
    }

    const MIKRO_HINWEIS = "Erzähl den Prozess einfach so, wie du ihn jemandem erklären würdest.";
    const zielFeld = () => (state.sprachZiel === "befehl" ? el.befehl : el.quelltext);

    const anzeigen = (aktiv) => {
      const befehl = state.sprachZiel === "befehl";
      el.mikro.classList.toggle("is-aktiv", aktiv && !befehl);
      el.mikro.setAttribute("aria-pressed", String(aktiv && !befehl));
      el.mikroText.textContent = aktiv && !befehl ? "Aufnahme beenden" : "Einsprechen";
      el.befehlMikro.classList.toggle("is-aktiv", aktiv && befehl);
      el.befehlMikro.setAttribute("aria-pressed", String(aktiv && befehl));
      el.mikro.disabled = aktiv && befehl;
      el.befehlMikro.disabled = aktiv && !befehl;
      if (!aktiv) {
        el.mikroStatus.classList.remove("zwischen");
        el.mikroStatus.textContent = MIKRO_HINWEIS;
      }
    };

    // Merkt sich, wo der zuletzt eingesprochene Satz im Zielfeld steht,
    // damit eine verbesserte Fassung ihn ersetzen kann statt ihn zu wiederholen.
    let letzterSatz = null;

    sprache.onFinal = (satz, { ersetzt, abschnitt } = {}) => {
      if (!satz) return;
      const feld = zielFeld();
      if (abschnitt) {
        // Server-Erkennung: Abschnitte enden oft mitten im Satz, deshalb kein Großbuchstabe und kein Punkt von der App
        feld.value = window.PPSprache.haengeAbschnittAn(feld.value, satz);
        letzterSatz = null;
      } else {
        satzEinfuegen(feld, satz, ersetzt);
      }
      if (feld === el.quelltext) {
        el.quelltext.scrollTop = el.quelltext.scrollHeight;
        aktualisiereZaehler();
        entwurfSichern();
      }
    };

    // Browser-Erkennung: ganze Sätze, eine verbesserte Fassung ersetzt den letzten Satz
    function satzEinfuegen(feld, satz, ersetzt) {
      const text = satz.charAt(0).toUpperCase() + satz.slice(1);
      const mitPunkt = `${text}${/[.!?]$/.test(text) ? "" : "."}`;
      const aktuell = feld.value;
      const unveraendert = letzterSatz && aktuell.length === letzterSatz.ende;
      if (ersetzt && unveraendert) {
        feld.value = aktuell.slice(0, letzterSatz.start) + mitPunkt;
        letzterSatz = { start: letzterSatz.start, ende: feld.value.length };
      } else {
        const trenner = aktuell && !/\s$/.test(aktuell) ? " " : "";
        const start = aktuell.length + trenner.length;
        feld.value = `${aktuell}${trenner}${mitPunkt}`;
        letzterSatz = { start, ende: feld.value.length };
      }
    }

    sprache.onZwischen = (zwischen) => {
      if (!sprache.aktiv) return;
      if (state.sprachZiel === "befehl") {
        el.befehlFortschritt.hidden = false;
        el.befehlFortschritt.textContent = zwischen ? `„${zwischen}“` : "Ich höre zu … Zum Ausführen das Mikrofon erneut drücken.";
        return;
      }
      el.mikroStatus.classList.toggle("zwischen", Boolean(zwischen));
      el.mikroStatus.textContent = zwischen || "Ich höre zu …";
    };
    sprache.onStatus = (status) => {
      if (status.gestartet) {
        anzeigen(true);
        if (state.sprachZiel === "befehl") {
          el.befehlFortschritt.hidden = false;
          el.befehlFortschritt.textContent = "Ich höre zu … Zum Ausführen das Mikrofon erneut drücken.";
        } else {
          el.mikroStatus.textContent = "Ich höre zu …";
        }
      }
      if (status.hinweis) {
        // Aufnahme beendet, der letzte Abschnitt wird noch verschriftet
        anzeigen(false);
        el.mikro.disabled = true;
        el.befehlMikro.disabled = true;
        if (state.sprachZiel === "befehl") {
          el.befehlFortschritt.hidden = false;
          el.befehlFortschritt.textContent = status.hinweis;
        } else {
          el.mikroStatus.textContent = status.hinweis;
        }
      }
      if (status.fehler) {
        toast(status.fehler, "error");
        if (!sprache.aktiv && !sprache.beschaeftigt) anzeigen(false);
      }
      if (status.beendet) {
        anzeigen(false);
        if (state.sprachZiel === "befehl" && !state.kiLaeuft) el.befehlFortschritt.hidden = true;
        // Befehl erst ausführen, wenn die Erkennung den letzten Satz geliefert hat
        if (state.befehlNachStopp) {
          state.befehlNachStopp = false;
          if (el.befehl.value.trim()) befehlAusfuehren();
        }
        if (state.erzeugenNachStopp) {
          state.erzeugenNachStopp = false;
          modellErzeugen();
        }
      }
    };

    const starte = (ziel) => {
      state.sprachZiel = ziel;
      state.befehlNachStopp = false;
      state.erzeugenNachStopp = false;
      letzterSatz = null;
      sprache.start();
    };

    el.mikro.addEventListener("click", () => {
      if (sprache.aktiv) {
        sprache.stop();
        if (!sprache.beschaeftigt) anzeigen(false);
      } else {
        starte("quelltext");
      }
    });

    el.befehlMikro.addEventListener("click", () => {
      if (sprache.aktiv) {
        state.befehlNachStopp = state.sprachZiel === "befehl";
        sprache.stop();
      } else if (!state.kiLaeuft) {
        starte("befehl");
      }
    });
  }

  // ---------- Anmeldung ----------

  function zeigeLogin() {
    if (!el.dialogLogin.open) {
      el.loginFehler.hidden = true;
      el.dialogLogin.showModal();
      el.loginPasswort.focus();
    }
  }

  el.formLogin.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/anmelden", { method: "POST", body: { passwort: el.loginPasswort.value } });
      el.loginPasswort.value = "";
      el.dialogLogin.close();
      await ladeModelle();
    } catch (error) {
      el.loginFehler.textContent = error.message;
      el.loginFehler.hidden = false;
    }
  });
  el.dialogLogin.addEventListener("cancel", (event) => event.preventDefault());

  async function ladeModelle() {
    const modelle = await api("/api/modelle");
    const gewaehlt = speicherLesen("pp.modell");
    el.modell.replaceChildren(...modelle.map((m) => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      return o;
    }));
    if (gewaehlt && modelle.some((m) => m.id === gewaehlt)) el.modell.value = gewaehlt;
  }

  // ---------- Start ----------

  async function start() {
    // Vor dem ersten Import lesen, der Import selbst setzt den Änderungsstatus zurück
    const modellEntwurf = modellEntwurfLesen();
    baueModeButtons();
    baueWissenFelder();
    await erstelleModeler(state.mode, LEER_XML);
    setDirty(false);
    entwurfLaden();
    if (modellEntwurf) {
      try {
        await importiere(modellEntwurf.xml);
        verbergeLeerHinweis();
        state.prozessId = modellEntwurf.prozessId || null;
        setDirty(true);
        toast("Ungespeichertes Modell aus der letzten Sitzung wiederhergestellt.", "ok");
      } catch (error) {
        console.error(error);
        await importiere(LEER_XML);
        setDirty(false);
      }
    }

    $("btn-erzeugen").addEventListener("click", modellErzeugen);
    $("btn-speichern").addEventListener("click", speichern);
    $("btn-prozesse").addEventListener("click", zeigeProzesse);
    $("btn-neu").addEventListener("click", neu);
    $("btn-oeffnen").addEventListener("click", oeffneDatei);
    $("btn-export").addEventListener("click", exportBpmn);
    $("btn-svg").addEventListener("click", exportSvg);
    $("btn-handbuch").addEventListener("click", exportHandbuch);
    $("btn-selbst-zeichnen").addEventListener("click", verbergeLeerHinweis);
    $("btn-element-schliessen").addEventListener("click", () => state.modeler.get("selection").select([]));
    el.befehlAusfuehren.addEventListener("click", befehlAusfuehren);
    el.befehl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        befehlAusfuehren();
      }
    });
    el.rueckgaengig.addEventListener("click", rueckgaengig);
    $("btn-bezug-weg").addEventListener("click", bezugEntfernen);
    $("btn-abmelden").addEventListener("click", async () => {
      await api("/api/abmelden", { method: "POST" }).catch(() => {});
      zeigeLogin();
    });
    el.dialogProzesse.querySelector("[data-close]").addEventListener("click", () => el.dialogProzesse.close());
    el.elementName.addEventListener("input", uebernehmeName);
    el.elementBeschreibung.addEventListener("input", uebernehmeBeschreibung);
    el.quelltext.addEventListener("input", () => {
      aktualisiereZaehler();
      entwurfSichern();
    });
    el.prozessname.addEventListener("input", entwurfSichern);
    el.modell.addEventListener("change", () => speicherSchreiben("pp.modell", el.modell.value));

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        speichern();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (state.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    window.addEventListener("resize", () => state.modeler && state.modeler.get("canvas").resized());

    let sitzung = null;
    try {
      sitzung = await api("/api/sitzung");
    } catch (error) {
      toast(error.message, "error");
    }
    richteSpracheEin(Boolean(sitzung && sitzung.spracheServer));
    if (!sitzung) return;
    try {
      if (!sitzung.passwortGesetzt) {
        toast("Auf dem Server ist noch kein Passwort hinterlegt (APP_PASSWORD).", "error");
        return;
      }
      if (!sitzung.angemeldet) {
        zeigeLogin();
        return;
      }
      await ladeModelle();
      const letzte = speicherLesen("pp.prozessId");
      if (letzte && !modellEntwurf) await ladeProzess(letzte, { felderBehalten: Boolean(speicherLesen("pp.entwurf")) });
    } catch (error) {
      if (error.status !== 401) toast(error.message, "error");
    }
  }

  start();
})();
