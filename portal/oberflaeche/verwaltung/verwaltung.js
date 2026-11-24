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
      const lizenz = el("select", { "aria-label": "Lizenz", disabled: !frei }, ...lizenzen.map((l) => el("option", { value: l, selected: frei && frei.lizenz === l, text: l === "test" ? "Test" : "Voll" })));
      const setzen = () => aendern(
        () => api(`${V}/mandanten/${mandant.id}/module/${modul.id}`, { method: "PUT", body: { an: haken.checked, lizenz: lizenz.value } }),
        `${modul.name} für ${mandant.name} ${haken.checked ? "freigeschaltet" : "gesperrt"}.`
      );
      haken.addEventListener("change", setzen);
      lizenz.addEventListener("change", setzen);
      return el("div", { class: "modul-wahl" }, el("label", { class: "modul-wahl", style: "margin:0;color:inherit;font-weight:400" }, haken, modul.name), lizenz);
    });
  }

  function zeigeMandanten(liste) {
    const body = document.getElementById("mandanten");
    body.replaceChildren();
    if (!liste.length) {
      body.append(el("tr", {}, el("td", { colspan: 5, class: "leer", text: "Noch keine Mandanten angelegt." })));
      return;
    }
    for (const m of liste) {
      const pw = el("input", { type: "text", autocomplete: "off", placeholder: "neues Passwort", "aria-label": `Neues Passwort für ${m.name}` });
      const pwKnopf = el("button", { class: "btn btn-zweit btn-klein", type: "button", text: "Setzen", onclick: () => {
        if (!pw.value) return;
        aendern(() => api(`${V}/mandanten/${m.id}`, { method: "PATCH", body: { passwort: pw.value } }), `Passwort für ${m.name} gesetzt.`);
      } });
      const sperre = el("button", { class: "btn btn-zweit btn-klein", type: "button", text: m.aktiv ? "Sperren" : "Entsperren", onclick: () => {
        aendern(() => api(`${V}/mandanten/${m.id}`, { method: "PATCH", body: { aktiv: !m.aktiv } }), `${m.name} ${m.aktiv ? "gesperrt" : "entsperrt"}.`);
      } });
      body.append(el("tr", { class: m.aktiv ? "" : "gesperrt" },
        el("td", {}, el("strong", { text: m.name }), el("div", { class: "klein", text: `angelegt ${datum(m.angelegt)}` })),
        el("td", { text: m.benutzername }),
        el("td", {}, ...modulZelle(m)),
        el("td", {}, el("div", { class: "passwort-neu" }, pw, pwKnopf)),
        el("td", {}, el("div", { class: m.aktiv ? "status-ok" : "status-fehler", text: m.aktiv ? "aktiv" : "gesperrt" }), sperre)
      ));
    }
  }

  function zeigeProtokoll(eintraege) {
    const body = document.getElementById("protokoll");
    body.replaceChildren();
    if (!eintraege.length) {
      body.append(el("tr", {}, el("td", { colspan: 6, class: "leer", text: "Noch keine Einträge." })));
      return;
    }
    for (const e of eintraege.slice(0, 100)) {
      body.append(el("tr", {},
        el("td", { class: "klein", text: datum(e.zeit) }),
        el("td", { text: e.mandant_id ? mandantNamen.get(e.mandant_id) || "?" : "" }),
        el("td", { text: e.modul_id || "" }),
        el("td", { text: e.aktion }),
        el("td", { class: e.ergebnis === "ok" ? "status-ok" : "status-fehler", text: e.ergebnis === "ok" ? "ok" : "Fehler" }),
        el("td", { class: "klein", text: e.details })
      ));
    }
  }

  function zeigeInhalt() {
    document.getElementById("anmeldung").hidden = true;
    document.getElementById("inhalt").hidden = false;
    document.getElementById("kopf-rechts").hidden = false;
    laden().catch((error) => meldung(error.message, "fehler"));
  }

  function zeigeAnmeldung(eingerichtet = true) {
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
