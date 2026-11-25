// Logbuch: BPMN-Datei(en) und Titel rein, Knopf, Handbuch als PDF raus (mehrere Dateien werden zusammengeführt)
(function () {
  "use strict";
  const { zeigeMeldung, api, abmelden } = Portal;
  const meldung = (text, art) => zeigeMeldung(document.getElementById("meldung"), text, art);
  const knopf = document.getElementById("btn-erstellen");
  const titelFeld = document.getElementById("titel");
  const ablage = document.getElementById("ablage");
  const eingabe = document.getElementById("datei");
  let dateien = [];

  // Rückmeldung „Passt das Handbuch?“ nach jedem erstellten Handbuch
  const rm = {
    karte: document.getElementById("rueckmeldung"),
    knoepfe: document.getElementById("rm-knoepfe"),
    form: document.getElementById("rm-form"),
    label: document.getElementById("rm-label"),
    text: document.getElementById("rm-text"),
    meldung: (text, art) => zeigeMeldung(document.getElementById("rm-meldung"), text, art),
    vorgang: "",
    passt: null
  };

  function zeigeRueckmeldung(vorgang) {
    rm.vorgang = vorgang || "";
    rm.passt = null;
    rm.karte.hidden = !rm.vorgang;
    rm.knoepfe.hidden = false;
    rm.form.hidden = true;
    rm.text.value = "";
    rm.meldung("");
  }

  async function sendeRueckmeldung(text = "") {
    await api("/api/m/handbuch/rueckmeldung", { method: "POST", body: { vorgang: rm.vorgang, passt: rm.passt, text } });
  }

  async function waehleAntwort(passt) {
    rm.passt = passt;
    try {
      await sendeRueckmeldung();
      rm.knoepfe.hidden = true;
      rm.label.textContent = passt ? "Möchten Sie noch etwas ergänzen? (freiwillig)" : "Was sollten wir verbessern? (freiwillig)";
      rm.form.hidden = false;
      rm.meldung("Vielen Dank für Ihre Rückmeldung.", "ok");
      rm.text.focus();
    } catch (error) {
      rm.meldung(`Die Rückmeldung konnte nicht gesendet werden: ${error.message}`, "fehler");
    }
  }

  document.getElementById("rm-ja").addEventListener("click", () => waehleAntwort(true));
  document.getElementById("rm-nein").addEventListener("click", () => waehleAntwort(false));
  rm.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = rm.text.value.trim();
    if (!text) return;
    try {
      await sendeRueckmeldung(text);
      rm.form.hidden = true;
      rm.meldung("Vielen Dank, Ihr Hinweis ist angekommen.", "ok");
    } catch (error) {
      rm.meldung(`Der Hinweis konnte nicht gesendet werden: ${error.message}`, "fehler");
    }
  });

  function pruefeKnopf() {
    knopf.disabled = !dateien.length || !titelFeld.value.trim();
  }

  // Titelvorschlag aus dem Dateinamen, solange der Anwender nichts eingegeben hat
  function titelVorschlag(name) {
    return name.replace(/\.(bpmn|xml)$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  }

  // Auswahl ersetzt die vorige; sortiert nach Namen (bei PICTURE steht das Hauptdiagramm meist vorn)
  function waehle(liste) {
    const neu = [...(liste || [])].sort((a, b) => a.name.localeCompare(b.name, "de"));
    if (!neu.length) return;
    dateien = neu;
    ablage.classList.add("pp-dropzone--selected");
    document.getElementById("ablage-titel").textContent = neu.length === 1 ? neu[0].name : `${neu.length} Dateien ausgewählt`;
    document.getElementById("ablage-text").textContent = `${neu.length > 1 ? `${neu.map((d) => d.name).join(", ")}. ` : ""}Andere Auswahl? Hier ablegen oder klicken.`;
    if (!titelFeld.value.trim()) titelFeld.value = titelVorschlag(neu[0].name);
    meldung("");
    pruefeKnopf();
  }

  function speichere(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  document.getElementById("form-erstellen").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!dateien.length || !titelFeld.value.trim()) return;
    const titel = titelFeld.value.trim();
    knopf.disabled = true;
    knopf.textContent = "Handbuch wird erstellt ...";
    meldung("");
    zeigeRueckmeldung("");
    try {
      const inhalte = await Promise.all(dateien.map(async (d) => ({ name: d.name, inhalt: await d.text() })));
      const res = await fetch("/api/m/handbuch/erstellen", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titel, dateien: inhalte })
      });
      if (res.status === 401 || res.status === 403) {
        location.href = "/";
        return;
      }
      if (!res.ok) {
        const daten = await res.json().catch(() => ({}));
        throw new Error(daten.fehler || `Fehler ${res.status}`);
      }
      speichere(await res.blob(), `${titel.replace(/[\\/:*?"<>|]/g, "").trim() || "Prozess"} Handbuch.pdf`);
      meldung("Das Handbuch ist erstellt und wird heruntergeladen.", "ok");
      zeigeRueckmeldung(res.headers.get("X-Vorgang"));
    } catch (error) {
      meldung(`Das Handbuch konnte nicht erstellt werden: ${error.message}`, "fehler");
    } finally {
      knopf.textContent = "Handbuch erstellen";
      pruefeKnopf();
    }
  });

  titelFeld.addEventListener("input", pruefeKnopf);
  eingabe.addEventListener("change", () => {
    waehle(eingabe.files);
    eingabe.value = "";
  });
  ablage.addEventListener("dragover", (e) => { e.preventDefault(); ablage.classList.add("pp-dropzone--over"); });
  ablage.addEventListener("dragleave", () => ablage.classList.remove("pp-dropzone--over"));
  ablage.addEventListener("drop", (e) => {
    e.preventDefault();
    ablage.classList.remove("pp-dropzone--over");
    waehle(e.dataTransfer.files);
  });
  document.getElementById("btn-abmelden").addEventListener("click", abmelden);

  api("/api/sitzung").then((s) => {
    if (!s.angemeldet) {
      location.href = "/";
      return;
    }
    document.getElementById("mandant-name").textContent = s.mandant.name;
  });
})();
