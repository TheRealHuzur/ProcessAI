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
    elementId: $("element-id"),
    dialogProzesse: $("dialog-prozesse"),
    prozessListe: $("prozess-liste"),
    dialogLogin: $("dialog-login"),
    formLogin: $("form-login"),
    loginPasswort: $("login-passwort"),
    loginFehler: $("login-fehler"),
    fileInput: $("file-input"),
    toasts: $("toast-container")
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
    letzteErzeugung: null,
    dirty: false,
    markierungen: [],
    ausgewaehlt: null,
    wechselt: false
  };

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
  }

  // ---------- Editor ----------

  function bindeModelerEvents(modeler) {
    const eventBus = modeler.get("eventBus");
    eventBus.on("commandStack.changed", () => {
      setDirty(true);
      verbergeLeerHinweis();
    });
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

  function setzeMarkierungen(fehler, hinweise) {
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
      return;
    }
    state.ausgewaehlt = element;
    fuellePanel(element, {});
    el.panelElement.hidden = false;
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

  function zeigeErgebnis(ergebnis) {
    const { pruefung, unklarheiten, nichtModelliert, korrigiert, modell, dauerMs } = ergebnis;
    el.listeFehler.replaceChildren(...pruefung.fehler.map((f) => befundElement(f.text, "fehler", f)));
    el.listeHinweise.replaceChildren(...pruefung.hinweise.map((h) => befundElement(h.text, "hinweis", h)));
    el.listeUnklar.replaceChildren(...unklarheiten.map((u) => befundElement(u, "frage")));
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
    const text = el.quelltext.value.trim();
    if (text.length < 20) {
      toast("Bitte zuerst den Prozess einsprechen oder beschreiben.", "error");
      el.quelltext.focus();
      return;
    }
    if (window.PPSprache.aktiv) window.PPSprache.stop();
    if (state.dirty && el.leerHinweis.hidden && !window.confirm("Das aktuelle Modell wird durch den neuen Entwurf ersetzt. Weiter?")) {
      return;
    }

    el.erzeugen.disabled = true;
    el.fortschritt.hidden = false;
    const beginn = Date.now();
    const meldungen = ["Die KI liest die Beschreibung …", "Die KI entwirft das Modell …", "Regelcheck läuft …", "Fast fertig …"];
    const timer = setInterval(() => {
      const s = Math.round((Date.now() - beginn) / 1000);
      el.fortschritt.textContent = `${meldungen[Math.min(Math.floor(s / 12), meldungen.length - 1)]} (${s} s)`;
    }, 500);
    el.fortschritt.textContent = meldungen[0];

    try {
      const ergebnis = await api("/api/erzeugen", {
        method: "POST",
        body: { text, prozessname: el.prozessname.value.trim(), modell: el.modell.value }
      });
      await importiere(ergebnis.xml);
      verbergeLeerHinweis();
      if (!el.prozessname.value.trim() && ergebnis.prozessname) {
        el.prozessname.value = ergebnis.prozessname;
        entwurfSichern();
      }
      setzeMarkierungen(ergebnis.pruefung.fehler, ergebnis.pruefung.hinweise);
      zeigeErgebnis(ergebnis);
      state.letzteErzeugung = { kiModell: ergebnis.modell, kiJson: ergebnis.modellJson, pruefung: ergebnis.pruefung };
      setDirty(true);
      toast("Modell erzeugt. Bitte prüfen.", "ok");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      clearInterval(timer);
      el.erzeugen.disabled = false;
      el.fortschritt.hidden = true;
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
        ...(state.letzteErzeugung || {})
      };
      const ergebnis = await api("/api/prozesse", { method: "POST", body });
      state.prozessId = ergebnis.id;
      state.letzteErzeugung = null;
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
      state.prozessId = prozess.id;
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

  function richteSpracheEin() {
    const sprache = window.PPSprache;
    if (!sprache.istVerfuegbar) {
      el.mikro.disabled = true;
      el.mikroStatus.textContent = "Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome verwenden oder den Text eintippen.";
      return;
    }

    const anzeigen = (aktiv) => {
      el.mikro.classList.toggle("is-aktiv", aktiv);
      el.mikro.setAttribute("aria-pressed", String(aktiv));
      el.mikroText.textContent = aktiv ? "Aufnahme beenden" : "Einsprechen";
      if (!aktiv) {
        el.mikroStatus.classList.remove("zwischen");
        el.mikroStatus.textContent = "Erzähl den Prozess einfach so, wie du ihn jemandem erklären würdest.";
      }
    };

    sprache.onFinal = (satz) => {
      if (!satz) return;
      const vorher = el.quelltext.value;
      const trenner = vorher && !/\s$/.test(vorher) ? " " : "";
      const text = satz.charAt(0).toUpperCase() + satz.slice(1);
      el.quelltext.value = `${vorher}${trenner}${text}${/[.!?]$/.test(text) ? "" : "."}`;
      el.quelltext.scrollTop = el.quelltext.scrollHeight;
      aktualisiereZaehler();
      entwurfSichern();
    };
    sprache.onZwischen = (zwischen) => {
      if (!sprache.aktiv) return;
      el.mikroStatus.classList.toggle("zwischen", Boolean(zwischen));
      el.mikroStatus.textContent = zwischen || "Ich höre zu …";
    };
    sprache.onStatus = (status) => {
      if (status.gestartet) {
        anzeigen(true);
        el.mikroStatus.textContent = "Ich höre zu …";
      }
      if (status.fehler) {
        toast(status.fehler, "error");
        if (!sprache.aktiv) anzeigen(false);
      }
      if (status.beendet) anzeigen(false);
    };

    el.mikro.addEventListener("click", () => {
      if (sprache.aktiv) {
        sprache.stop();
        anzeigen(false);
      } else {
        sprache.start();
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
    baueModeButtons();
    await erstelleModeler(state.mode, LEER_XML);
    setDirty(false);
    entwurfLaden();
    richteSpracheEin();

    $("btn-erzeugen").addEventListener("click", modellErzeugen);
    $("btn-speichern").addEventListener("click", speichern);
    $("btn-prozesse").addEventListener("click", zeigeProzesse);
    $("btn-neu").addEventListener("click", neu);
    $("btn-oeffnen").addEventListener("click", oeffneDatei);
    $("btn-export").addEventListener("click", exportBpmn);
    $("btn-svg").addEventListener("click", exportSvg);
    $("btn-selbst-zeichnen").addEventListener("click", verbergeLeerHinweis);
    $("btn-element-schliessen").addEventListener("click", () => state.modeler.get("selection").select([]));
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

    try {
      const sitzung = await api("/api/sitzung");
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
      if (letzte) await ladeProzess(letzte, { felderBehalten: Boolean(speicherLesen("pp.entwurf")) });
    } catch (error) {
      if (error.status !== 401) toast(error.message, "error");
    }
  }

  start();
})();
