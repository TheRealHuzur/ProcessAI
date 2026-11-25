// Verwaltung des Kundenportals: Mandanten anlegen, Module freischalten, Passwort setzen, sperren
(function () {
  "use strict";
  const { api, zeigeMeldung, datum, el } = Portal;
  const V = "/api/verwaltung";
  let module = [];
  let lizenzen = [];
  let mandantNamen = new Map();

  const meldung = (text, art) => zeigeMeldung(document.getElementById("meldung"), text, art);

  async function laden() {
    const [m, l, p] = await Promise.all([api(`${V}/module`), api(`${V}/mandanten`), api(`${V}/protokoll`)]);
    module = m.module;
    lizenzen = m.lizenzen;
    mandantNamen = new Map(l.mandanten.map((x) => [x.id, x.name]));
    zeigeMandanten(l.mandanten);
    zeigeProtokoll(p.eintraege);
  }

  async function aendern(aufruf, erfolg) {
    try {
      await aufruf();
      meldung(erfolg, "ok");
      await laden();
    } catch (error) {
      meldung(error.message, "fehler");
    }
  }

  function modulZelle(mandant) {
    return module.map((modul) => {
      const frei = mandant.module.find((x) => x.modul_id === modul.id);
      const haken = el("input", { type: "checkbox", checked: Boolean(frei), "aria-label": `${modul.name} für ${mandant.name}` });
      const lizenz = el("select", { class: "pp-field", "aria-label": `Lizenz ${modul.name} für ${mandant.name}`, disabled: !frei }, ...lizenzen.map((l) => el("option", { value: l, selected: frei && frei.lizenz === l, text: l === "test" ? "Test" : "Voll" })));
      const setzen = () => aendern(
        () => api(`${V}/mandanten/${mandant.id}/module/${modul.id}`, { method: "PUT", body: { an: haken.checked, lizenz: lizenz.value } }),
        `${modul.name} für ${mandant.name} ${haken.checked ? "freigeschaltet" : "gesperrt"}.`
      );
      haken.addEventListener("change", setzen);
      lizenz.addEventListener("change", setzen);
      return el("div", { class: "modul-wahl" }, el("label", {}, haken, modul.name), lizenz);
    });
  }

  function zeigeMandanten(liste) {
    const body = document.getElementById("mandanten");
    body.replaceChildren();
    if (!liste.length) {
      body.append(el("tr", {}, el("td", { colspan: 5, class: "pp-small", text: "Noch keine Mandanten angelegt." })));
      return;
    }
    for (const m of liste) {
      const pw = el("input", { class: "pp-field", type: "text", autocomplete: "off", placeholder: "neues Passwort", "aria-label": `Neues Passwort für ${m.name}` });
      const pwKnopf = el("button", { class: "pp-btn pp-btn--text", type: "button", text: "Setzen", onclick: () => {
        if (!pw.value) return;
        aendern(() => api(`${V}/mandanten/${m.id}`, { method: "PATCH", body: { passwort: pw.value } }), `Passwort für ${m.name} gesetzt.`);
      } });
      const sperre = el("button", { class: "pp-btn pp-btn--text", type: "button", text: m.aktiv ? "Sperren" : "Entsperren", onclick: () => {
        aendern(() => api(`${V}/mandanten/${m.id}`, { method: "PATCH", body: { aktiv: !m.aktiv } }), `${m.name} ${m.aktiv ? "gesperrt" : "entsperrt"}.`);
      } });
      // Passwort im Klartext auf Klick; vor dem 25.11.2026 gesetzte Passwörter gibt es nur als Hash
      const klar = el("span", { class: "pp-small" });
      const zeigen = el("button", { class: "pp-btn pp-btn--text", type: "button", text: "Passwort anzeigen", onclick: async () => {
        if (klar.childNodes.length) {
          klar.replaceChildren();
          zeigen.textContent = "Passwort anzeigen";
          return;
        }
        try {
          const { passwort } = await api(`${V}/mandanten/${m.id}/passwort`);
          klar.replaceChildren(passwort === null
            ? document.createTextNode("Nicht lesbar gespeichert. Einmal neu setzen (auch mit dem bisherigen Passwort), dann lesbar.")
            : el("code", { text: passwort }));
          zeigen.textContent = "Verbergen";
        } catch (error) {
          meldung(error.message, "fehler");
        }
      } });
      const auswerten = el("input", { type: "checkbox", checked: m.auswerten, "aria-label": `${m.name} in der Auswertung zählen` });
      auswerten.addEventListener("change", () => aendern(
        () => api(`${V}/mandanten/${m.id}`, { method: "PATCH", body: { auswerten: auswerten.checked } }),
        `${m.name} ${auswerten.checked ? "zählt wieder in der Auswertung" : "zählt nicht mehr in der Auswertung"}.`));
      body.append(el("tr", { class: m.aktiv ? "" : "gesperrt" },
        el("td", {}, el("strong", { text: m.name }), el("div", { class: "pp-small", text: `angelegt ${datum(m.angelegt)}` })),
        el("td", { text: m.benutzername }),
        el("td", {}, ...modulZelle(m)),
        el("td", {}, el("div", { class: "passwort-neu" }, pw, pwKnopf), el("div", { class: "passwort-klar" }, zeigen, klar)),
        el("td", {}, el("div", { class: "zugang" }, el("span", { class: `pp-tag pp-tag--${m.aktiv ? "success" : "error"}`, text: m.aktiv ? "aktiv" : "gesperrt" }), sperre,
          el("label", { class: "auswerten" }, auswerten, "in Auswertung")))
      ));
    }
  }

  function zeigeProtokoll(eintraege) {
    const body = document.getElementById("protokoll");
    body.replaceChildren();
    if (!eintraege.length) {
      body.append(el("tr", {}, el("td", { colspan: 6, class: "pp-small", text: "Noch keine Einträge." })));
      return;
    }
    for (const e of eintraege.slice(0, 100)) {
      body.append(el("tr", {},
        el("td", { class: "pp-small", text: datum(e.zeit) }),
        el("td", { text: e.mandant_id ? mandantNamen.get(e.mandant_id) || "?" : "" }),
        el("td", { text: e.modul_id || "" }),
        el("td", { text: e.aktion }),
        el("td", {}, el("span", { class: `pp-tag pp-tag--${e.ergebnis === "ok" ? "success" : "error"}`, text: e.ergebnis === "ok" ? "ok" : "Fehler" })),
        el("td", { class: "pp-small", text: e.details })
      ));
    }
  }

  function band(titel, einleitung) {
    document.getElementById("band-titel").textContent = titel;
    document.getElementById("band-einleitung").textContent = einleitung;
  }

  function zeigeInhalt() {
    band("Mandanten", "Jeder Mandant hat genau einen Zugang. Das Passwort legen Sie fest; es gibt kein Zurücksetzen per Mail.");
    document.getElementById("anmeldung").hidden = true;
    document.getElementById("inhalt").hidden = false;
    document.getElementById("kopf-rechts").hidden = false;
    laden().catch((error) => meldung(error.message, "fehler"));
  }

  function zeigeAnmeldung(eingerichtet = true) {
    band("Anmelden", "Melden Sie sich mit dem Passwort der Verwaltung an.");
    document.getElementById("inhalt").hidden = true;
    document.getElementById("kopf-rechts").hidden = true;
    document.getElementById("anmeldung").hidden = false;
    if (!eingerichtet) zeigeMeldung(document.getElementById("meldung-anmelden"), "Auf dem Server ist kein Passwort für die Verwaltung hinterlegt (PORTAL_ADMIN_PASSWORT).");
  }

  document.getElementById("form-anmelden").addEventListener("submit", async (event) => {
    event.preventDefault();
    const feld = document.getElementById("admin-passwort");
    try {
      await api(`${V}/anmelden`, { method: "POST", body: { passwort: feld.value } });
      feld.value = "";
      zeigeInhalt();
    } catch (error) {
      zeigeMeldung(document.getElementById("meldung-anmelden"), error.message);
    }
  });

  document.getElementById("form-neu").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("neu-name");
    const benutzer = document.getElementById("neu-benutzer");
    const pw = document.getElementById("neu-passwort");
    aendern(async () => {
      await api(`${V}/mandanten`, { method: "POST", body: { name: name.value, benutzername: benutzer.value, passwort: pw.value } });
      name.value = "";
      benutzer.value = "";
      pw.value = "";
    }, "Mandant angelegt. Jetzt die Module freischalten.");
  });

  document.getElementById("btn-abmelden").addEventListener("click", async () => {
    await api(`${V}/abmelden`, { method: "POST" }).catch(() => {});
    location.reload();
  });

  api(`${V}/sitzung`).then((s) => (s.angemeldet ? zeigeInhalt() : zeigeAnmeldung(s.eingerichtet))).catch(() => zeigeAnmeldung());
})();
