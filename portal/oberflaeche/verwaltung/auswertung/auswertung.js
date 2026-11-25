// Auswertung des Kundenportals für die Verwaltung. Aufbau nach dem AnalyseDESK (Auswahl oben, Kopfband mit
// Vergleich zum Vorzeitraum, Säulen je Tag, Balkenlisten, Tabellen, Stand). Liest nur, schreibt nichts.
(function () {
  "use strict";
  const { api, zeigeMeldung, datum, el } = Portal;
  const V = "/api/verwaltung";
  const ZEITRAEUME = [["7", "7 Tage"], ["30", "30 Tage"], ["90", "90 Tage"], ["alle", "Gesamt"]];
  const STATUS = {
    aktiv: ["success", "aktiv"],
    ruhig: ["neutral", "ruhig"],
    eingeschlafen: ["error", "eingeschlafen"],
    "nie angemeldet": ["neutral", "nie angemeldet"],
    gesperrt: ["error", "gesperrt"]
  };
  const WIEDERHOLUNG = { geaendert: "Datei geändert", unveraendert: "gleiche Datei", unbekannt: "nicht bekannt" };

  const params = new URLSearchParams(location.search);
  const zustand = {
    zeitraum: ZEITRAEUME.some(([k]) => k === params.get("zeitraum")) ? params.get("zeitraum") : "30",
    mandant: params.get("mandant") || "",
    daten: null
  };
  const meldung = (text, art) => zeigeMeldung(document.getElementById("aw-meldung"), text, art);

  // ---------- Formate ----------
  const zahl = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString("de-DE"));
  const prozent = (teil, ganz) => (ganz ? `${Math.round((teil / ganz) * 100)} %` : "–");
  const kurzTag = (tag) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${tag}T12:00:00Z`));
  const langTag = (tag) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${tag}T12:00:00Z`));
  const wochentag = (tag) => new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${tag}T12:00:00Z`));
  const zeitOder = (iso) => (iso ? datum(iso) : "–");
  const dauer = (stunden) => (stunden === null || stunden === undefined ? "" : stunden < 1 ? "nach unter 1 Std." : stunden < 48 ? `nach ${Math.round(stunden)} Std.` : `nach ${Math.round(stunden / 24)} Tagen`);
  const leer = (text) => el("p", { class: "aw-leer", text });
  const tag = (art, text) => el("span", { class: `pp-tag ${art === "neutral" || art === "hinweis" ? `aw-tag--${art}` : `pp-tag--${art}`}`, text });

  // ---------- Tooltip (Maus und Tastatur) ----------
  const tipp = document.getElementById("aw-tipp");
  function zeigeTipp(ziel) {
    tipp.textContent = ziel.dataset.tipp;
    tipp.hidden = false;
    const r = ziel.getBoundingClientRect();
    const t = tipp.getBoundingClientRect();
    const links = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
    const oben = r.top - t.height - 8 > 8 ? r.top - t.height - 8 : r.bottom + 8;
    tipp.style.left = `${links}px`;
    tipp.style.top = `${oben}px`;
  }
  const versteckeTipp = () => { tipp.hidden = true; };
  for (const art of ["mouseover", "focusin"]) {
    document.addEventListener(art, (e) => {
      const ziel = e.target.closest && e.target.closest("[data-tipp]");
      if (ziel) zeigeTipp(ziel);
    });
  }
  for (const art of ["mouseout", "focusout"]) {
    document.addEventListener(art, (e) => { if (e.target.closest && e.target.closest("[data-tipp]")) versteckeTipp(); });
  }
  window.addEventListener("scroll", versteckeTipp, { passive: true });

  // ---------- Bausteine ----------
  function karte(titel, unter, ...inhalt) {
    return el("section", { class: "pp-card pp-card--plain" },
      el("h2", { class: "aw-titel", text: titel }),
      unter ? el("p", { class: "aw-unter", text: unter }) : null,
      ...inhalt);
  }

  // Kennzahl mit Vergleich zum Vorzeitraum (nur Text, keine Wertung per Farbe)
  function kachel(name, wert, { vorher, zusatz, haupt = false, format = zahl } = {}) {
    let vergleich = zusatz || "";
    if (vorher !== null && vorher !== undefined && zustand.daten.portal.zeitraum.vergleich_von) {
      vergleich = `${vergleich ? `${vergleich} · ` : ""}vorher ${format(vorher)}`;
    }
    return el("div", { class: "aw-kachel" },
      el("span", { class: "aw-kachel__name", text: name }),
      el("span", { class: `aw-kachel__wert${haupt ? " aw-kachel__wert--haupt" : ""}`, text: format(wert) }),
      vergleich ? el("span", { class: "aw-kachel__zusatz", text: vergleich }) : null);
  }

  // Obergrenze der Achse: runde Werte, mindestens 4
  const obergrenze = (max) => (max <= 4 ? 4 : max <= 10 ? Math.ceil(max / 2) * 2 : Math.ceil(max / 10) * 10);

  // Säulen; serien: [{ feld, name, klasse }], unten zuerst. Ohne Werte keine Säule, nur die Trefferfläche.
  function saeulen(punkte, serien, { beschriftung, tippTitel }) {
    const top = obergrenze(Math.max(0, ...punkte.map((p) => serien.reduce((s, x) => s + (p[x.feld] || 0), 0))));
    const flaeche = el("div", { class: "aw-flaeche", role: "list" });
    for (const p of punkte) {
      const werte = serien.filter((x) => p[x.feld] > 0);
      const text = `${tippTitel(p)}\n${serien.map((x) => `${x.name}: ${zahl(p[x.feld] || 0)}`).join("\n")}`;
      const saeule = el("div", { class: "aw-saeule", role: "listitem", tabindex: "0", "data-tipp": text, "aria-label": text.replace(/\n/g, ", ") },
        ...werte.map((x, i) => el("div", {
          class: `aw-teil aw-teil--${x.klasse}${i === werte.length - 1 ? " aw-teil--oben" : ""}`,
          style: `height: calc(${((p[x.feld] / top) * 100).toFixed(2)}% - ${i ? 2 : 0}px)`
        })));
      flaeche.append(saeule);
    }
    const mitte = punkte[Math.floor((punkte.length - 1) / 2)];
    return el("div", {},
      el("div", { class: "aw-diagramm" },
        el("div", { class: "aw-achse", "aria-hidden": "true" }, el("span", { text: zahl(top) }), el("span", { text: zahl(top / 2) }), el("span", { text: "0" })),
        flaeche,
        el("div", { class: "aw-tage", "aria-hidden": "true" },
          el("span", { text: punkte.length ? beschriftung(punkte[0]) : "" }),
          punkte.length > 2 ? el("span", { text: beschriftung(mitte) }) : null,
          el("span", { text: punkte.length > 1 ? beschriftung(punkte[punkte.length - 1]) : "" }))),
      serien.length > 1 ? el("div", { class: "aw-legende" }, ...serien.map((x) => el("span", {}, el("i", { class: `aw-teil--${x.klasse}` }), x.name))) : null);
  }

  // Balkenliste: name, wert (Balkenlänge), zahlText rechts, klein darunter
  function balkenliste(eintraege, { max } = {}) {
    if (!eintraege.length) return null;
    const groesst = max || Math.max(1, ...eintraege.map((e) => e.wert));
    return el("div", { class: "aw-liste" }, ...eintraege.map((e) => el("div", { class: "aw-zeile" },
      el("span", { class: "aw-zeile__name", text: e.name }),
      el("span", { class: "aw-zeile__zahl" }, el("strong", { text: e.zahlText })),
      el("div", { class: "aw-zeile__spur", "aria-hidden": "true" }, el("div", { style: `width: ${((e.wert / groesst) * 100).toFixed(1)}%` })),
      e.klein ? el("span", { class: "aw-zeile__klein", text: e.klein }) : null)));
  }

  function tabelle(kopf, zeilen, { zahlSpalten = [] } = {}) {
    return el("div", { class: "pp-table-wrap" }, el("table", { class: "pp-table" },
      el("thead", {}, el("tr", {}, ...kopf.map((k, i) => el("th", { class: zahlSpalten.includes(i) ? "aw-zahl" : "", text: k })))),
      el("tbody", {}, ...zeilen.map((z) => el("tr", {}, ...z.map((zelle, i) => {
        const td = el("td", { class: zahlSpalten.includes(i) ? "aw-zahl" : "" });
        if (zelle instanceof Node || Array.isArray(zelle)) td.append(...[zelle].flat().filter(Boolean));
        else td.textContent = zelle ?? "–";
        return td;
      }))))));
  }

  // ---------- Bereiche ----------
  function renderKopf() {
    const { portal: p, logbuch: l } = zustand.daten;
    const z = p.zeitraum;
    const titel = z.schluessel === "alle" ? "Gesamter Zeitraum" : `Letzte ${z.name}`;
    const spanne = z.von ? `${langTag(z.von)} bis ${langTag(z.bis)}` : `${p.erfasst_ab ? `seit ${datum(p.erfasst_ab)}` : "noch keine Einträge"}`;
    const vergleich = z.vergleich_von ? `verglichen mit ${langTag(z.vergleich_von)} bis ${langTag(z.vergleich_bis)}` : "";
    const hb = l.kopf.handbuecher;
    const quote = (k) => (k.handbuecher ? Math.round((k.fehler / k.handbuecher) * 100) : null);
    const passtGesamt = l.kopf.passt.wert + l.kopf.passt_nicht.wert;
    const passtVorher = l.kopf.passt.vorher === null ? null : l.kopf.passt.vorher + l.kopf.passt_nicht.vorher;
    const anteil = (teil, ganz) => (ganz ? Math.round((teil / ganz) * 100) : null);
    const pz = (n) => (n === null || n === undefined ? "–" : `${n} %`);
    return el("section", { class: "pp-card pp-card--plain" },
      el("div", { class: "aw-kopf" },
        el("h2", { text: titel }),
        el("span", { class: "pp-small", text: [spanne, vergleich].filter(Boolean).join(" · ") })),
      el("div", { class: "aw-kacheln" },
        kachel("Aktive Organisationen", p.kopf.aktive_mandanten.wert, { vorher: p.kopf.aktive_mandanten.vorher }),
        kachel("Sitzungen", p.kopf.sitzungen.wert, { vorher: p.kopf.sitzungen.vorher, zusatz: `${zahl(p.kopf.anmeldungen.wert)} Anmeldungen` }),
        kachel("Handbücher erstellt", l.kopf.ok.wert, { vorher: l.kopf.ok.vorher, haupt: true, zusatz: `${zahl(hb.wert)} Versuche` }),
        kachel("Fehlerquote", quote({ handbuecher: hb.wert, fehler: l.kopf.fehler.wert }), {
          vorher: hb.vorher === null ? null : quote({ handbuecher: hb.vorher, fehler: l.kopf.fehler.vorher }), format: pz,
          zusatz: `${zahl(l.kopf.fehler.wert)} mit Fehler`
        }),
        kachel("Neue Versuche", l.kopf.wiederholungen.wert, { vorher: l.kopf.wiederholungen.vorher }),
        kachel("Abbrüche", l.kopf.abbrueche.wert, { vorher: l.kopf.abbrueche.vorher }),
        kachel("Passt das Handbuch?", anteil(l.kopf.passt.wert, passtGesamt), {
          vorher: passtVorher === null ? null : anteil(l.kopf.passt.vorher, passtVorher), format: pz,
          zusatz: `${zahl(passtGesamt)} Rückmeldungen`
        }),
        kachel("Fehlversuche Anmeldung", p.kopf.fehlversuche.wert, { vorher: p.kopf.fehlversuche.vorher })));
  }

  function renderVerlauf() {
    const { portal: p, logbuch: l } = zustand.daten;
    const beschriftung = (x) => kurzTag(x.tag);
    const tippTitel = (x) => `${wochentag(x.tag)} ${langTag(x.tag)}`;
    const hatHandbuecher = l.tage.some((t) => t.ok || t.fehler);
    const hatSitzungen = p.tage.some((t) => t.sitzungen);
    return el("div", { class: "aw-zwei" },
      karte("Handbücher je Tag", "Erfolgreich erstellt und mit Fehler abgebrochen",
        hatHandbuecher ? saeulen(l.tage, [{ feld: "ok", name: "erstellt", klasse: "ok" }, { feld: "fehler", name: "mit Fehler", klasse: "fehler" }], { beschriftung, tippTitel })
          : leer("In diesem Zeitraum wurde kein Handbuch erstellt.")),
      karte("Sitzungen je Tag", "Anmeldungen und Besuche mit bestehender Anmeldung",
        hatSitzungen ? saeulen(p.tage, [{ feld: "sitzungen", name: "Sitzungen", klasse: "ok" }], {
          beschriftung, tippTitel: (x) => `${tippTitel(x)}\nOrganisationen: ${zahl(x.mandanten)}`
        }) : leer("In diesem Zeitraum gab es keine Sitzung.")));
  }

  function renderHerkunftUndFehler() {
    const l = zustand.daten.logbuch;
    return el("div", { class: "aw-zwei" },
      karte("Herkunft der Dateien", "Aus welchem Werkzeug die Modelle stammen, laut Datei",
        balkenliste(l.herkunft.map((h) => ({
          name: h.name, wert: h.anzahl, zahlText: `${zahl(h.anzahl)} Handbücher`,
          klein: `${zahl(h.dateien)} Dateien · ${h.fehler ? `${zahl(h.fehler)} mit Fehler (${prozent(h.fehler, h.anzahl)})` : "ohne Fehler"}`
        }))) || leer("Noch keine Handbücher in diesem Zeitraum.")),
      karte("Häufigste Fehler", "Die Meldung, die der Kunde gesehen hat",
        balkenliste(l.fehlermeldungen.map((f) => ({
          name: f.meldung, wert: f.anzahl, zahlText: `${zahl(f.anzahl)}×`, klein: `${f.herkunft.join(", ")} · zuletzt ${datum(f.zuletzt)}`
        }))) || leer("Keine Fehler in diesem Zeitraum.")));
  }

  function renderProbleme() {
    const l = zustand.daten.logbuch;
    const r = l.regeln;
    return el("div", { class: "aw-zwei" },
      karte("Neue Versuche", `Gleiches Handbuch innerhalb von ${r.wiederholung_min} Minuten noch einmal erstellt: Das Ergebnis hat vermutlich nicht gepasst.`,
        l.wiederholungen.length ? tabelle(["Wann und wer", "Titel", "Art"], l.wiederholungen.map((w) => [
          [el("div", { text: datum(w.zeit) }), el("div", { class: "pp-small", text: w.organisation || "?" })],
          w.titel,
          [tag(w.art === "geaendert" ? "hinweis" : "neutral", WIEDERHOLUNG[w.art] || w.art),
            el("div", { class: "pp-small", text: `${zahl(w.abstand_min)} Min. ${w.vorher_status === "fehler" ? "nach Fehler" : "nach Erfolg"}` })]
        ])) : leer("Keine neuen Versuche in diesem Zeitraum.")),
      karte("Abbrüche", `Logbuch geöffnet und nichts versucht, oder nach einem Fehler kein Handbuch innerhalb von ${r.abbruch_min} Minuten.`,
        l.abbrueche.length ? tabelle(["Wann und wer", "Art", "Angaben"], l.abbrueche.map((a) => [
          [el("div", { text: datum(a.zeit) }), el("div", { class: "pp-small", text: a.organisation || "?" })],
          tag(a.art === "nach Fehler" ? "error" : "neutral", a.art === "nach Fehler" ? "nach Fehler" : "ohne Versuch"),
          [a.titel ? el("div", { text: a.titel }) : null, a.meldung ? el("div", { class: "pp-small", text: a.meldung }) : null]
        ])) : leer("Keine Abbrüche in diesem Zeitraum.")));
  }

  function renderRueckmeldungen() {
    const l = zustand.daten.logbuch;
    const ja = l.kopf.passt.wert;
    const nein = l.kopf.passt_nicht.wert;
    const ohne = l.rueckmeldungen.ohne;
    const gesamt = ja + nein + ohne;
    const teile = [["Ja, passt", ja, "var(--pp-success)"], ["Nicht ganz", nein, "var(--pp-error)"], ["Ohne Rückmeldung", ohne, "var(--pp-border-field)"]];
    const anteil = gesamt ? el("div", { class: "aw-anteil", role: "img", "aria-label": teile.map(([n, w]) => `${n}: ${w}`).join(", ") },
      ...teile.filter(([, w]) => w > 0).map(([n, w, farbe]) => el("div", {
        style: `flex: ${w} 1 0; background: ${farbe}`, "data-tipp": `${n}: ${zahl(w)} (${prozent(w, gesamt)})`, tabindex: "0"
      }))) : null;
    const legende = el("div", { class: "aw-legende" }, ...teile.map(([n, w, farbe]) => el("span", {}, el("i", { style: `background: ${farbe}` }), `${n} ${zahl(w)}`)));
    const liste = l.rueckmeldungen.liste.length ? tabelle(["Zeit", "Organisation", "Handbuch", "Antwort", "Hinweis"], l.rueckmeldungen.liste.map((x) => [
      datum(x.zeit), x.organisation || "?", x.titel,
      tag(x.passt ? "success" : "error", x.passt ? "passt" : "nicht ganz"),
      x.text ? el("div", { class: "aw-zitat", text: x.text }) : el("span", { class: "pp-small", text: "ohne Text" })
    ])) : leer("Noch keine Rückmeldungen in diesem Zeitraum.");
    return karte("Rückmeldungen der Kunden", "Antworten auf „Passt das Handbuch?“ nach dem Erstellen; je Handbuch zählt die letzte Antwort.",
      gesamt ? el("div", {}, anteil, legende) : null, liste);
  }

  function renderBestandteile() {
    const b = zustand.daten.logbuch.bestandteile;
    if (!b.handbuecher) {
      return karte("Was in den Dateien steckt", "Elemente, Erweiterungen und Herstellerfelder der hochgeladenen Dateien",
        leer("Noch keine Auswertung der Bestandteile in diesem Zeitraum."));
    }
    const eintraege = (liste) => liste.map((e) => ({
      name: e.name.replace(/^bpmn:/, ""), wert: e.handbuecher, zahlText: `${zahl(e.handbuecher)} von ${zahl(b.handbuecher)}`,
      klein: `${zahl(e.anzahl)}× · ${e.herkunft.join(", ")}`
    }));
    const SICHTBAR = 8;
    const liste = (titel, unter, l, leerText) => el("div", {},
      el("h3", { class: "pp-small", style: "font-size: 16px; margin-bottom: 4px;", text: titel }),
      el("p", { class: "aw-unter", style: "margin: 0 0 10px;", text: unter }),
      balkenliste(eintraege(l.slice(0, SICHTBAR)), { max: b.handbuecher }) || leer(leerText),
      l.length > SICHTBAR ? el("details", { class: "aw-mehr", style: "margin-top: 12px;" },
        el("summary", { text: `${l.length - SICHTBAR} weitere` }),
        balkenliste(eintraege(l.slice(SICHTBAR)), { max: b.handbuecher })) : null);
    return karte("Was in den Dateien steckt", `Aus ${zahl(b.handbuecher)} Handbüchern dieses Zeitraums. Je Eintrag: in wie vielen Handbüchern er vorkommt.`
      + (b.warnungen ? ` Beim Einlesen gab es ${zahl(b.warnungen)} Warnungen.` : ""),
      el("div", { class: "aw-drei" },
        liste("Herstellerfelder mit Inhalt", "Gepflegte Felder aus PICTURE oder ADONIS, die das Handbuch nicht zeigt", b.felder, "Keine."),
        liste("Elemente ohne Platz im Handbuch", "BPMN-Elemente, die der Einleser nicht liest", b.ungenutzt, "Keine, alle Elemente werden gelesen."),
        liste("Fremde Erweiterungen", "Erweiterungen und Attribute anderer Hersteller", b.fremd, "Keine.")),
      el("details", { class: "aw-mehr" },
        el("summary", { text: "Was das Handbuch nutzt oder bewusst weglässt" }),
        el("div", { class: "aw-drei" },
          liste("Genutzte Elemente", "Pools, Bahnen, Aufgaben, Teilprozesse, Beschreibung", b.genutzt, "Keine."),
          liste("Genutzte Herstellerfelder", "Beschreibung und Verknüpfungen aus PICTURE", b.genutzte_felder, "Keine."),
          liste("Bewusst weggelassen", "Ereignisse, Gateways und Flüsse", b.weggelassen, "Keine."))));
  }

  function renderOrganisationen() {
    const { portal: p, logbuch: l } = zustand.daten;
    const reife = new Map(l.reife.map((r) => [r.mandant_id, r]));
    const zeilen = p.mandanten.map((m) => {
      const r = reife.get(m.id);
      const [art, text] = STATUS[m.status] || ["neutral", m.status];
      const anteil = r && r.schritte ? r.mit_arbeitshilfe / r.schritte : null;
      return [
        [el("strong", { text: m.name }), el("div", { class: "pp-small", text: m.benutzername })],
        [tag(art, text), m.tage_seit !== null ? el("div", { class: "pp-small", text: m.tage_seit === 0 ? "heute aktiv" : `vor ${m.tage_seit} ${m.tage_seit === 1 ? "Tag" : "Tagen"}` }) : null],
        zeitOder(m.erste_anmeldung),
        [el("div", { text: zeitOder(m.erstes_handbuch) }), m.erstes_handbuch ? el("div", { class: "pp-small", text: dauer(m.stunden_bis_erstes_handbuch) }) : null],
        zahl(m.aktive_tage),
        zahl(m.sitzungen),
        r ? zahl(r.handbuecher) : "0",
        anteil === null ? "–" : [el("div", { text: `${Math.round(anteil * 100)} % von ${zahl(r.schritte)}` }),
          el("div", { class: "aw-meter", "aria-hidden": "true" }, el("div", { style: `width: ${(anteil * 100).toFixed(0)}%` }))],
        r && r.zeichen_je_arbeitshilfe !== null ? `${zahl(r.zeichen_je_arbeitshilfe)} Zeichen` : "–",
        r ? zahl(r.mit_angaben) : "–",
        r ? zahl(r.fehlende_unterdiagramme) : "–"
      ];
    });
    return karte("Organisationen", `Verlauf je Organisation und Reife der Beschreibungen. Sitzungen, Handbücher und Reife im gewählten Zeitraum; ruhig ab ${p.schwellen.ruhig_ab_tagen}, eingeschlafen ab ${p.schwellen.eingeschlafen_ab_tagen} Tagen ohne Aktivität.`,
      zeilen.length ? tabelle(["Organisation", "Status", "Erste Anmeldung", "Erstes Handbuch", "Aktive Tage", "Sitzungen", "Handbücher", "Schritte mit Arbeitshilfe", "Länge je Arbeitshilfe", "Mit Angaben", "Unterdiagramm fehlt"],
        zeilen, { zahlSpalten: [4, 5, 6, 9, 10] }) : leer("Noch keine Organisationen angelegt."));
  }

  function renderWochen() {
    const p = zustand.daten.portal;
    return karte("Aktive Organisationen je Woche", "Die letzten zwölf Wochen, unabhängig vom gewählten Zeitraum",
      saeulen(p.wochen, [{ feld: "mandanten", name: "Organisationen", klasse: "ok" }], {
        beschriftung: (w) => kurzTag(w.start),
        tippTitel: (w) => `Woche ab ${langTag(w.start)}`
      }));
  }

  function renderHandbuecher() {
    const { handbuecher, portal: p } = zustand.daten;
    const z = p.zeitraum;
    const B = `${V}/m/handbuch`;
    const tagVon = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(iso));
    const liste = handbuecher.filter((h) => (zustand.mandant ? h.mandant_id === zustand.mandant : h.auswerten) && (!z.von || tagVon(h.erstellt) >= z.von));
    const inhalt = (h) => {
      if (h.status !== "ok") return [el("div", { text: h.meldung || "ohne Meldung" })];
      if (h.seiten === null) return [el("div", { text: "keine Kennzahlen (vor 25.11.2026)" })];
      return [
        `${h.seiten} Seiten · ${h.schritte} Schritte`,
        `${h.mit_arbeitshilfe} mit Arbeitshilfe · ${h.mit_angaben} mit Angaben`,
        h.fehlende_unterdiagramme ? `${h.fehlende_unterdiagramme} Unterdiagramm${h.fehlende_unterdiagramme === 1 ? "" : "e"} fehlen` : "",
        `${(h.dauer_ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s`
      ].filter(Boolean).map((t) => el("div", { text: t }));
    };
    const zeilen = liste.map((h) => [
      datum(h.erstellt), h.organisation || "?", h.titel,
      tag(h.status === "ok" ? "success" : "error", h.status === "ok" ? "ok" : "Fehler"),
      el("div", { class: "pp-small" }, ...inhalt(h)),
      el("span", { class: "pp-small", text: h.werkzeug || "–" }),
      el("div", { class: "pp-small aw-dateien" },
        h.pdf ? el("div", {}, el("a", { href: `${B}/handbuecher/${encodeURIComponent(h.vorgang)}/pdf`, text: "PDF" })) : null,
        ...h.dateien_liste.map((d) => el("div", {}, el("a", { href: `${B}/dateien/${encodeURIComponent(d.id)}`, text: d.name }))))
    ]);
    return karte("Handbücher", "Jedes Handbuch dieser Auswahl mit Kennzahlen; PDF und Originaldateien zum Herunterladen.",
      zeilen.length ? tabelle(["Zeit", "Organisation", "Titel", "Ergebnis", "Inhalt", "Herkunft", "Dateien"], zeilen) : leer("Keine Handbücher in diesem Zeitraum."));
  }

  function renderStand() {
    const { portal: p, logbuch: l } = zustand.daten;
    const ab = (text, iso) => (iso ? `${text} seit ${datum(iso)}` : `${text}: noch keine`);
    return el("p", { class: "aw-stand" },
      `Gemessen: ${[ab("Protokoll", p.erfasst_ab), ab("Besuche", p.besuche_ab), ab("Handbücher", l.erfasst_ab), ab("Kennzahlen", l.kennzahlen_ab),
        ab("Bestandteile", l.bestandteile_ab), ab("Seitenaufrufe Logbuch", l.seitenaufrufe_ab)].join(" · ")}. `
      + (p.nicht_ausgewertet.length ? `Nicht ausgewertet (nur einzeln wählbar): ${p.nicht_ausgewertet.join(", ")}. ` : "")
      + "Eine Sitzung ist eine Anmeldung oder ein Besuch mit bestehender Anmeldung (höchstens einer je 30 Minuten). Tage nach deutscher Zeit. "
      + `Stand ${datum(p.zeitraum.jetzt)}.`);
  }

  function render() {
    const ziel = document.getElementById("aw-inhalt");
    ziel.replaceChildren(
      renderKopf(),
      renderVerlauf(),
      renderHerkunftUndFehler(),
      renderProbleme(),
      renderRueckmeldungen(),
      renderBestandteile(),
      renderOrganisationen(),
      renderWochen(),
      renderHandbuecher(),
      renderStand());
  }

  // ---------- Auswahl und Laden ----------
  function renderAuswahl(mandanten) {
    const schalter = document.getElementById("aw-zeitraeume");
    schalter.replaceChildren(...ZEITRAEUME.map(([k, name]) => el("button", {
      type: "button", "aria-pressed": String(k === zustand.zeitraum), text: name,
      onclick: () => { zustand.zeitraum = k; laden(); }
    })));
    const wahl = document.getElementById("aw-mandant");
    if (mandanten) {
      wahl.replaceChildren(el("option", { value: "", text: "Alle Organisationen" }),
        ...mandanten.map((m) => el("option", { value: m.id, text: m.auswerten ? m.name : `${m.name} (nicht ausgewertet)`, selected: m.id === zustand.mandant })));
    }
  }

  async function laden() {
    renderAuswahl();
    const q = new URLSearchParams({ zeitraum: zustand.zeitraum });
    if (zustand.mandant) q.set("mandant", zustand.mandant);
    history.replaceState(null, "", `${location.pathname}?${q}`);
    try {
      const [portal, logbuch, liste] = await Promise.all([
        api(`${V}/auswertung?${q}`), api(`${V}/m/handbuch/auswertung?${q}`), api(`${V}/m/handbuch/handbuecher?anzahl=1000`)
      ]);
      zustand.daten = { portal, logbuch, handbuecher: liste.handbuecher };
      meldung("");
      render();
    } catch (error) {
      if (error.status === 401) location.href = "/verwaltung/";
      else meldung(`Die Auswertung konnte nicht geladen werden: ${error.message}`, "fehler");
    }
  }

  document.getElementById("aw-mandant").addEventListener("change", (e) => {
    zustand.mandant = e.target.value;
    laden();
  });

  document.getElementById("aw-export").addEventListener("click", () => {
    if (!zustand.daten) return;
    const inhalt = JSON.stringify({ erstellt: new Date().toISOString(), auswahl: { zeitraum: zustand.zeitraum, mandant: zustand.mandant || null }, ...zustand.daten }, null, 2);
    const url = URL.createObjectURL(new Blob([inhalt], { type: "application/json" }));
    const a = el("a", { href: url, download: `auswertung-portal-${zustand.zeitraum}-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  document.getElementById("btn-abmelden").addEventListener("click", async () => {
    await api(`${V}/abmelden`, { method: "POST" }).catch(() => {});
    location.href = "/verwaltung/";
  });

  api(`${V}/sitzung`).then(async (s) => {
    if (!s.angemeldet) {
      location.href = "/verwaltung/";
      return;
    }
    document.getElementById("kopf-rechts").hidden = false;
    const { mandanten } = await api(`${V}/mandanten`);
    renderAuswahl(mandanten);
    await laden();
  }).catch((error) => meldung(error.message, "fehler"));
})();
