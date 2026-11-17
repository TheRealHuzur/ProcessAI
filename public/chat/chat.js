// ProzessPilot Chat: Frage zu einem Prozess stellen, Antwort mit Fundstellen im Modell
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    shell: document.querySelector(".chat-shell"),
    seiteZu: $("seite-zu"),
    seiteAuf: $("seite-auf"),
    hauptKopf: $("haupt-kopf"),
    aktuellerProzess: $("aktueller-prozess"),
    arbeitsbereich: $("arbeitsbereich"),
    suche: $("suche"),
    prozesse: $("prozesse"),
    modell: $("modell"),
    form: $("frage-form"),
    frage: $("frage"),
    senden: $("senden"),
    status: $("status"),
    antworten: $("antworten")
  };

  const state = {
    prozesse: [],
    bereiche: [],
    // Aktiver Arbeitsbereich, gemeinsam mit dem Editor gemerkt; links stehen nur seine Prozesse
    bereich: null,
    gewaehlt: null,
    // Verlauf je Prozess, nur in diesem Fenster; die letzten Einträge gehen als Zusammenhang mit
    verlaeufe: new Map(),
    laeuft: false
  };

  function lesen(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function schreiben(key, wert) {
    try {
      window.localStorage.setItem(key, wert);
    } catch {
      /* ohne Speicher geht es auch */
    }
  }

  async function api(pfad, { method = "GET", body } = {}) {
    const res = await fetch(pfad, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
    if (res.status === 401) {
      window.location.href = "/?weiter=chat";
      throw new Error("Bitte anmelden.");
    }
    let daten = null;
    try {
      daten = await res.json();
    } catch {
      daten = null;
    }
    if (!res.ok) throw new Error((daten && daten.fehler) || `Fehler ${res.status}`);
    return daten;
  }

  function zeigeStatus(text, art = "") {
    el.status.textContent = text;
    el.status.dataset.art = art;
  }

  function datum(iso) {
    return new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" });
  }

  // ---------- Prozesse links ----------

  function prozesseImBereich() {
    return state.prozesse.filter((p) => !state.bereich || p.arbeitsbereich_id === state.bereich);
  }

  function zeigeProzesse() {
    const suche = el.suche.value.trim().toLowerCase();
    const imBereich = prozesseImBereich();
    const liste = imBereich.filter((p) => !suche || p.name.toLowerCase().includes(suche));
    if (liste.length === 0) {
      const li = document.createElement("li");
      li.className = "prozesse-leer";
      li.textContent = imBereich.length ? "Kein Prozess passt zur Suche." : "In diesem Arbeitsbereich sind noch keine Prozesse gespeichert.";
      el.prozesse.replaceChildren(li);
      return;
    }
    el.prozesse.replaceChildren(...liste.map((p) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prozess";
      b.setAttribute("aria-current", String(state.gewaehlt === p.id));
      b.textContent = p.name;
      const meta = document.createElement("span");
      meta.className = "prozess-meta";
      meta.textContent = `Version ${p.version || 1}, ${datum(p.geaendert)}`;
      b.append(meta);
      b.addEventListener("click", () => waehle(p.id));
      li.append(b);
      return li;
    }));
  }

  function waehle(id) {
    state.gewaehlt = id;
    if (id) schreiben("pp.chat.prozess", id);
    zeigeProzesse();
    zeigeVerlauf();
    zeigeStatus("");
    el.frage.focus();
  }

  function gewaehlterProzess() {
    return state.prozesse.find((p) => p.id === state.gewaehlt) || null;
  }

  // ---------- Arbeitsbereich ----------

  function zeigeBereiche() {
    el.arbeitsbereich.replaceChildren(...state.bereiche.map((b) => {
      const o = document.createElement("option");
      o.value = b.id;
      o.textContent = b.name;
      return o;
    }));
    if (state.bereich) el.arbeitsbereich.value = state.bereich;
  }

  // Wechselt den Bereich; liegt der gewählte Prozess nicht darin, gilt der erste des Bereichs
  function waehleBereich(id) {
    state.bereich = id;
    schreiben("pp.arbeitsbereich", id);
    el.suche.value = "";
    const imBereich = prozesseImBereich();
    if (!imBereich.some((p) => p.id === state.gewaehlt)) state.gewaehlt = (imBereich[0] && imBereich[0].id) || null;
    if (state.gewaehlt) schreiben("pp.chat.prozess", state.gewaehlt);
    zeigeProzesse();
    zeigeVerlauf();
  }

  // ---------- Seitenleiste ein- und ausklappen ----------

  // Zugeklappt zeigt der Chat nur den gewählten Prozess, etwa zum Vorführen
  function setzeSeiteZu(zu) {
    el.shell.classList.toggle("seite-zu", zu);
    el.hauptKopf.hidden = !zu;
    el.seiteZu.setAttribute("aria-expanded", String(!zu));
    el.seiteAuf.setAttribute("aria-expanded", String(!zu));
    schreiben("pp.chat.seiteZu", zu ? "1" : "");
    zeigeAktuellenProzess();
  }

  function zeigeAktuellenProzess() {
    const prozess = gewaehlterProzess();
    el.aktuellerProzess.textContent = prozess ? prozess.name : "";
  }

  // ---------- Antworten ----------

  function zeigeVerlauf() {
    zeigeAktuellenProzess();
    const prozess = gewaehlterProzess();
    const verlauf = state.verlaeufe.get(state.gewaehlt) || [];
    if (!prozess || verlauf.length === 0) {
      const p = document.createElement("p");
      p.className = "antworten-leer";
      p.textContent = prozess
        ? `Frag etwas zu „${prozess.name}“. Die Antwort kommt nur aus dem, was im Modell und in den Arbeitshilfen steht.`
        : el.shell.classList.contains("seite-zu") ? "Klapp die Seitenleiste aus und wähle einen Prozess." : "Wähle links einen Prozess aus.";
      el.antworten.replaceChildren(p);
      return;
    }
    // Neueste Antwort direkt unter der Eingabezeile
    el.antworten.replaceChildren(...verlauf.slice().reverse().map(austausch));
  }

  function austausch(e) {
    const box = document.createElement("article");
    box.className = "austausch";
    const frage = document.createElement("p");
    frage.className = "austausch-frage";
    frage.textContent = e.frage;
    const antwort = document.createElement("p");
    antwort.className = "austausch-antwort";
    antwort.textContent = e.antwort;
    box.append(frage, antwort);

    if (!e.beantwortet) {
      const luecke = document.createElement("span");
      luecke.className = "luecke";
      luecke.textContent = "Steht nicht vollständig im hinterlegten Wissen";
      box.append(luecke);
    }

    if (e.fundstellen.length) {
      const titel = document.createElement("p");
      titel.className = "fundstellen-titel";
      titel.textContent = "Im Modell zeigen";
      const liste = document.createElement("ul");
      liste.className = "fundstellen";
      for (const f of e.fundstellen) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "fundstelle";
        a.href = `/?prozess=${encodeURIComponent(e.prozessId)}&element=${encodeURIComponent(f.id)}`;
        a.target = "prozesspilot";
        a.title = "Im ProzessPilot öffnen und den Schritt auswählen";
        const typ = document.createElement("span");
        typ.className = "fundstelle-typ";
        typ.textContent = `${f.typ}: `;
        a.append(typ, f.name || f.id);
        li.append(a);
        liste.append(li);
      }
      box.append(titel, liste);
    }

    const meta = document.createElement("p");
    meta.className = "austausch-meta";
    meta.textContent = `Version ${e.version}, ${e.modellName}`;
    box.append(meta);
    return box;
  }

  async function fragen(event) {
    event.preventDefault();
    if (state.laeuft) return;
    const frage = el.frage.value.trim();
    const prozess = gewaehlterProzess();
    if (!prozess) {
      zeigeStatus("Bitte links einen Prozess auswählen.", "fehler");
      return;
    }
    if (frage.length < 2) {
      el.frage.focus();
      return;
    }
    const verlauf = state.verlaeufe.get(prozess.id) || [];
    state.laeuft = true;
    el.senden.disabled = true;
    zeigeStatus("Die KI sucht im hinterlegten Wissen …");
    try {
      const r = await api("/api/chat", {
        method: "POST",
        body: {
          prozessId: prozess.id,
          frage,
          modell: el.modell.value,
          verlauf: verlauf.slice(-4).map(({ frage: f, antwort }) => ({ frage: f, antwort }))
        }
      });
      verlauf.push({
        frage,
        antwort: r.antwort,
        beantwortet: r.beantwortet,
        fundstellen: r.fundstellen || [],
        prozessId: r.prozess.id,
        version: r.prozess.version,
        modellName: el.modell.selectedOptions[0] ? el.modell.selectedOptions[0].textContent : r.modell
      });
      state.verlaeufe.set(prozess.id, verlauf);
      el.frage.value = "";
      passeHoeheAn();
      zeigeStatus("");
      if (state.gewaehlt === prozess.id) zeigeVerlauf();
    } catch (error) {
      zeigeStatus(error.message, "fehler");
    } finally {
      state.laeuft = false;
      el.senden.disabled = false;
      el.frage.focus();
    }
  }

  function passeHoeheAn() {
    el.frage.style.height = "auto";
    el.frage.style.height = `${Math.min(el.frage.scrollHeight, 200)}px`;
  }

  // ---------- Start ----------

  async function start() {
    el.form.addEventListener("submit", fragen);
    el.frage.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        el.form.requestSubmit();
      }
    });
    el.frage.addEventListener("input", passeHoeheAn);
    el.suche.addEventListener("input", zeigeProzesse);
    el.arbeitsbereich.addEventListener("change", () => waehleBereich(el.arbeitsbereich.value));
    el.seiteZu.addEventListener("click", () => {
      setzeSeiteZu(true);
      el.seiteAuf.focus();
    });
    el.seiteAuf.addEventListener("click", () => {
      setzeSeiteZu(false);
      el.seiteZu.focus();
    });
    setzeSeiteZu(lesen("pp.chat.seiteZu") === "1");
    el.modell.addEventListener("change", () => schreiben("pp.chat.modell", el.modell.value));

    try {
      const [prozesse, modelle, bereiche] = await Promise.all([api("/api/prozesse"), api("/api/chat/modelle"), api("/api/arbeitsbereiche")]);
      state.prozesse = prozesse;
      state.bereiche = bereiche;
      const gemerkterBereich = lesen("pp.arbeitsbereich");
      state.bereich = bereiche.some((b) => b.id === gemerkterBereich) ? gemerkterBereich : (bereiche[0] && bereiche[0].id) || null;
      zeigeBereiche();
      el.modell.replaceChildren(...modelle.map((m) => {
        const o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.label;
        return o;
      }));
      const modell = lesen("pp.chat.modell");
      if (modelle.some((m) => m.id === modell)) el.modell.value = modell;
      const gemerkt = lesen("pp.chat.prozess");
      const imBereich = prozesseImBereich();
      state.gewaehlt = imBereich.some((p) => p.id === gemerkt) ? gemerkt : (imBereich[0] && imBereich[0].id) || null;
      zeigeProzesse();
      zeigeVerlauf();
      el.frage.focus();
    } catch (error) {
      zeigeStatus(error.message, "fehler");
    }
  }

  start();
})();
