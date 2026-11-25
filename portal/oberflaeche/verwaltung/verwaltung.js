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
    const [m, l, p, n, h] = await Promise.all([
      api(`${V}/module`), api(`${V}/mandanten`), api(`${V}/protokoll`), api(`${V}/nutzung`), api(`${V}/m/handbuch/handbuecher`)
    ]);
    module = m.module;
    lizenzen = m.lizenzen;
    mandantNamen = new Map(l.mandanten.map((x) => [x.id, x.name]));
    zeigeMandanten(l.mandanten);
    zeigeNutzung(n.mandanten);
    zeigeHandbuecher(h.handbuecher);
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
      body.append(el("tr", { class: m.aktiv ? "" : "gesperrt" },
        el("td", {}, el("strong", { text: m.name }), el("div", { class: "pp-small", text: `angelegt ${datum(m.angelegt)}` })),
        el("td", { text: m.benutzername }),
        el("td", {}, ...modulZelle(m)),
        el("td", {}, el("div", { class: "passwort-neu" }, pw, pwKnopf)),
        el("td", {}, el("div", { class: "zugang" }, el("span", { class: `pp-tag pp-tag--${m.aktiv ? "success" : "error"}`, text: m.aktiv ? "aktiv" : "gesperrt" }), sperre))
      ));
    }
  }

  const leereZeile = (body, spalten, text) => body.append(el("tr", {}, el("td", { colspan: spalten, class: "pp-small", text })));
  const zeitOder = (iso) => (iso ? datum(iso) : "–");

  function zeigeNutzung(liste) {
    const body = document.getElementById("nutzung");
    body.replaceChildren();
    if (!liste.length) return leereZeile(body, 7, "Noch keine Mandanten angelegt.");
    for (const m of liste) {
      const hb = m.module.filter((a) => a.modul_id === "handbuch" && a.aktion === "handbuch erstellt");
      const ok = hb.filter((a) => a.ergebnis === "ok").reduce((s, a) => s + a.anzahl, 0);
      const fehler = hb.filter((a) => a.ergebnis !== "ok").reduce((s, a) => s + a.anzahl, 0);
      body.append(el("tr", { class: m.aktiv ? "" : "gesperrt" },
        el("td", {}, el("strong", { text: m.name }), el("div", { class: "pp-small", text: m.benutzername })),
        el("td", { text: String(m.anmeldungen) }),
        el("td", { text: String(m.fehlversuche) }),
        el("td", { text: String(m.besuche) }),
        el("td", {}, `${ok} `, fehler ? el("span", { class: "pp-tag pp-tag--error", text: `${fehler} Fehler` }) : null),
        el("td", { class: "pp-small", text: zeitOder(m.letzte_anmeldung) }),
        el("td", { class: "pp-small", text: zeitOder(m.zuletzt_aktiv) })
      ));
    }
  }

  function zeigeHandbuecher(liste) {
    const body = document.getElementById("handbuecher");
    body.replaceChildren();
    if (!liste.length) return leereZeile(body, 7, "Noch keine Handbücher erstellt.");
    const B = `${V}/m/handbuch`;
    // Kennzahlen des Inhalts; bei Fehlern steht stattdessen die Meldung, die der Kunde gesehen hat
    const inhalt = (h) => {
      if (h.status !== "ok") return [el("div", { text: h.meldung || "ohne Meldung" })];
      if (h.seiten === null) return [el("div", { text: "keine Kennzahlen (vor 25.11.2026)" })];
      const zeilen = [
        `${h.seiten} Seiten · ${h.schritte} Schritte`,
        `${h.mit_arbeitshilfe} mit Arbeitshilfe · ${h.mit_angaben} mit Angaben`,
        h.fehlende_unterdiagramme ? `${h.fehlende_unterdiagramme} Unterdiagramm${h.fehlende_unterdiagramme === 1 ? "" : "e"} fehlen` : "",
        `${(h.dauer_ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s`
      ];
      return zeilen.filter(Boolean).map((t) => el("div", { class: "kennzahl", text: t }));
    };
    for (const h of liste) {
      const ok = h.status === "ok";
      const links = [
        h.pdf ? el("div", {}, el("a", { href: `${B}/handbuecher/${encodeURIComponent(h.vorgang)}/pdf`, text: "PDF" })) : null,
        ...h.dateien_liste.map((d) => el("div", {}, el("a", { href: `${B}/dateien/${encodeURIComponent(d.id)}`, text: d.name })))
      ];
      body.append(el("tr", {},
        el("td", { class: "pp-small", text: datum(h.erstellt) }),
        el("td", { text: h.organisation || "?" }),
        el("td", { text: h.titel }),
        el("td", {}, el("span", { class: `pp-tag pp-tag--${ok ? "success" : "error"}`, text: ok ? "ok" : "Fehler" })),
        el("td", { class: "pp-small" }, ...inhalt(h)),
        el("td", { class: "pp-small", text: h.werkzeug || "–" }),
        el("td", { class: "pp-small dateien" }, ...links)
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
