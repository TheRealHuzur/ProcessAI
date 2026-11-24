// Gemeinsame Hilfen für alle Seiten des Kundenportals (auch für die Seiten der Module)
(function (global) {
  "use strict";

  async function api(pfad, { method = "GET", body, headers = {}, roh = false } = {}) {
    const optionen = { method, headers: { ...headers }, credentials: "same-origin" };
    if (body !== undefined) {
      if (roh) optionen.body = body;
      else {
        optionen.headers["Content-Type"] = "application/json";
        optionen.body = JSON.stringify(body);
      }
    }
    const res = await fetch(pfad, optionen);
    let daten = {};
    try {
      daten = await res.json();
    } catch {
      daten = {};
    }
    if (!res.ok) {
      const fehler = new Error(daten.fehler || `Fehler ${res.status}`);
      fehler.status = res.status;
      throw fehler;
    }
    return daten;
  }

  function zeigeMeldung(el, text, art = "fehler") {
    if (!el) return;
    el.textContent = text || "";
    el.className = `meldung ${art}`;
    el.hidden = !text;
  }

  function datum(iso) {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  }

  function el(tag, attribute = {}, ...kinder) {
    const knoten = document.createElement(tag);
    for (const [k, v] of Object.entries(attribute)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "text") knoten.textContent = v;
      else if (k.startsWith("on")) knoten.addEventListener(k.slice(2), v);
      else knoten.setAttribute(k, v === true ? "" : v);
    }
    for (const kind of kinder.flat()) if (kind !== null && kind !== undefined) knoten.append(kind);
    return knoten;
  }

  async function abmelden() {
    await api("/api/abmelden", { method: "POST" }).catch(() => {});
    location.href = "/";
  }

  global.Portal = { api, zeigeMeldung, datum, el, abmelden };
})(window);
