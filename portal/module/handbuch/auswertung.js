// Auswertung des Logbuchs für die Verwaltung: Handbücher, Herkunft, Fehler, Bestandteile der Dateien,
// Wiederholungen, Abbrüche, Reife der Beschreibungen und Rückmeldungen der Kunden.
import { zeitraumAus, imZeitraum, imVergleich, tagBerlin, tageDesZeitraums } from "../../zeit.js";

// Neuer Versuch, wenn derselbe Mandant innerhalb dieser Zeit wieder ein Handbuch zum selben Titel oder zu denselben Dateien erstellt
const WIEDERHOLUNG_MS = 30 * 60 * 1000;
// Abbruch, wenn danach innerhalb dieser Zeit kein (erfolgreiches) Handbuch kommt; jüngere Fälle sind noch offen
const ABBRUCH_MS = 60 * 60 * 1000;
const LISTE = 50;
const TOP = 30;

const ms = (iso) => new Date(iso).getTime();
const ohneVersion = (w) => w.replace(/\s+v?\d[\w.-]*$/i, "").trim();

// "PICTURE Prozessplattform 3.0.0, ADONIS" -> "PICTURE Prozessplattform + ADONIS"; leer -> "unbekannt"
export function herkunftName(werkzeug) {
  const namen = [...new Set(String(werkzeug || "").split(",").map((w) => ohneVersion(w.trim())).filter(Boolean))];
  return namen.length ? namen.join(" + ") : "unbekannt";
}

function zahlMitVergleich(liste, z, wert) {
  return {
    wert: wert(liste.filter((x) => imZeitraum(x.zeit, z))),
    vorher: z.vergleich_von ? wert(liste.filter((x) => imVergleich(x.zeit, z))) : null
  };
}

// Neue Versuche: gleicher Mandant, kurz nach dem vorigen Handbuch, gleicher Titel oder gleiche Dateinamen
export function findeWiederholungen(handbuecher, dateienJeVorgang) {
  const ergebnis = [];
  const letzteJeMandant = new Map();
  for (const h of handbuecher) {
    const vorher = letzteJeMandant.get(h.mandant_id);
    letzteJeMandant.set(h.mandant_id, h);
    if (!vorher || ms(h.erstellt) - ms(vorher.erstellt) > WIEDERHOLUNG_MS) continue;
    const jetzt = dateienJeVorgang.get(h.vorgang) || [];
    const davor = dateienJeVorgang.get(vorher.vorgang) || [];
    const gleicheNamen = jetzt.some((d) => davor.some((v) => v.name === d.name));
    if (h.titel !== vorher.titel && !gleicheNamen) continue;
    const hashes = (l) => l.map((d) => d.hash).sort().join("|");
    const art = [...jetzt, ...davor].some((d) => !d.hash) ? "unbekannt" : hashes(jetzt) === hashes(davor) ? "unveraendert" : "geaendert";
    ergebnis.push({
      zeit: h.erstellt,
      vorgang: h.vorgang,
      mandant_id: h.mandant_id,
      organisation: h.organisation,
      titel: h.titel,
      status: h.status,
      art,
      abstand_min: Math.round((ms(h.erstellt) - ms(vorher.erstellt)) / 60000),
      vorher_status: vorher.status,
      vorher_meldung: vorher.meldung
    });
  }
  return ergebnis;
}

// Abbrüche: Logbuch geöffnet und kein Handbuch versucht, oder Fehler und danach kein erfolgreiches Handbuch
export function findeAbbrueche(handbuecher, seitenaufrufe, jetzt) {
  const entschieden = (zeit) => ms(jetzt) - ms(zeit) > ABBRUCH_MS;
  const danach = (mandantId, zeit, nurOk) => handbuecher.some((h) => h.mandant_id === mandantId
    && ms(h.erstellt) >= ms(zeit) && ms(h.erstellt) - ms(zeit) <= ABBRUCH_MS && h.erstellt !== zeit && (!nurOk || h.status === "ok"));
  const ergebnis = [];
  for (const s of seitenaufrufe) {
    if (entschieden(s.zeit) && !danach(s.mandant_id, s.zeit, false)) {
      ergebnis.push({ zeit: s.zeit, mandant_id: s.mandant_id, organisation: s.organisation, art: "ohne Versuch", titel: "", meldung: "" });
    }
  }
  for (const h of handbuecher.filter((x) => x.status === "fehler")) {
    if (entschieden(h.erstellt) && !danach(h.mandant_id, h.erstellt, true)) {
      ergebnis.push({ zeit: h.erstellt, mandant_id: h.mandant_id, organisation: h.organisation, art: "nach Fehler", titel: h.titel, meldung: h.meldung, vorgang: h.vorgang });
    }
  }
  return ergebnis.sort((a, b) => (a.zeit < b.zeit ? 1 : -1));
}

// Bestandteile aller Handbücher zusammenzählen: je Name in wie vielen Handbüchern und wie oft, aus welcher Herkunft
function bestandteileZusammen(handbuecher) {
  const bereiche = ["ungenutzt", "fremd", "felder", "genutzte_felder", "weggelassen", "genutzt"];
  const summe = Object.fromEntries(bereiche.map((b) => [b, new Map()]));
  let mitDaten = 0;
  let warnungen = 0;
  for (const h of handbuecher) {
    let teile;
    try {
      teile = h.bestandteile ? JSON.parse(h.bestandteile) : null;
    } catch {
      teile = null;
    }
    if (!teile) continue;
    mitDaten += 1;
    warnungen += teile.warnungen || 0;
    const herkunft = herkunftName(h.werkzeug);
    for (const b of bereiche) {
      for (const [name, anzahl] of Object.entries(teile[b] || {})) {
        const e = summe[b].get(name) || { name, handbuecher: 0, anzahl: 0, herkunft: new Set() };
        e.handbuecher += 1;
        e.anzahl += anzahl;
        e.herkunft.add(herkunft);
        summe[b].set(name, e);
      }
    }
  }
  const liste = (b) => [...summe[b].values()]
    .sort((x, y) => y.handbuecher - x.handbuecher || y.anzahl - x.anzahl || x.name.localeCompare(y.name, "de"))
    .slice(0, TOP)
    .map((e) => ({ ...e, herkunft: [...e.herkunft].sort() }));
  return { handbuecher: mitDaten, warnungen, ...Object.fromEntries(bereiche.map((b) => [b, liste(b)])) };
}

export function auswertung(db, { zeitraum, mandant = null, jetzt = new Date() } = {}) {
  const z = zeitraumAus(zeitraum, jetzt);
  // Mandanten ohne Auswertung (z. B. Patricks eigener Testzugang) zählen nur, wenn sie ausdrücklich gewählt sind
  const ohne = new Set(db.prepare("SELECT id FROM mandanten WHERE auswerten = 0").all().map((m) => m.id));
  const nurMandant = (x) => (mandant ? x.mandant_id === mandant : !ohne.has(x.mandant_id));
  const handbuecher = db.prepare(`SELECT h.*, m.name AS organisation FROM hb_handbuecher h
                                  LEFT JOIN mandanten m ON m.id = h.mandant_id ORDER BY h.erstellt`).all()
    .filter(nurMandant).map((h) => ({ ...h, zeit: h.erstellt }));
  const dateienJeVorgang = new Map();
  for (const d of db.prepare("SELECT vorgang, dateiname, inhalt_hash FROM hb_uploads").all()) {
    if (!dateienJeVorgang.has(d.vorgang)) dateienJeVorgang.set(d.vorgang, []);
    dateienJeVorgang.get(d.vorgang).push({ name: d.dateiname, hash: d.inhalt_hash });
  }
  const seitenaufrufe = db.prepare(`SELECT p.zeit, p.mandant_id, m.name AS organisation FROM protokoll p
                                    LEFT JOIN mandanten m ON m.id = p.mandant_id
                                    WHERE p.modul_id = 'handbuch' AND p.aktion = 'seite' ORDER BY p.zeit`).all().filter(nurMandant);
  // Letzte Rückmeldung je Handbuch
  const rueckJeVorgang = new Map();
  for (const r of db.prepare("SELECT * FROM hb_rueckmeldungen ORDER BY id").all()) rueckJeVorgang.set(r.vorgang, r);
  const handbuchVon = new Map(handbuecher.map((h) => [h.vorgang, h]));
  const rueckmeldungen = [...rueckJeVorgang.values()].filter((r) => handbuchVon.has(r.vorgang))
    .map((r) => ({ ...r, passt: Boolean(r.passt), organisation: handbuchVon.get(r.vorgang).organisation, titel: handbuchVon.get(r.vorgang).titel }));

  const wiederholungen = findeWiederholungen(handbuecher, dateienJeVorgang);
  const abbrueche = findeAbbrueche(handbuecher, seitenaufrufe, jetzt);
  const imZ = (x) => imZeitraum(x.zeit, z);
  const hbZ = handbuecher.filter(imZ);
  const okZ = hbZ.filter((h) => h.status === "ok");

  const kopf = {
    handbuecher: zahlMitVergleich(handbuecher, z, (l) => l.length),
    ok: zahlMitVergleich(handbuecher, z, (l) => l.filter((h) => h.status === "ok").length),
    fehler: zahlMitVergleich(handbuecher, z, (l) => l.filter((h) => h.status === "fehler").length),
    wiederholungen: zahlMitVergleich(wiederholungen, z, (l) => l.length),
    abbrueche: zahlMitVergleich(abbrueche, z, (l) => l.length),
    seitenaufrufe: zahlMitVergleich(seitenaufrufe, z, (l) => l.length),
    passt: zahlMitVergleich(rueckmeldungen, z, (l) => l.filter((r) => r.passt).length),
    passt_nicht: zahlMitVergleich(rueckmeldungen, z, (l) => l.filter((r) => !r.passt).length)
  };

  const tage = tageDesZeitraums(z, handbuecher[0] && handbuecher[0].erstellt).map((tag) => {
    const amTag = hbZ.filter((h) => tagBerlin(h.erstellt) === tag);
    return { tag, ok: amTag.filter((h) => h.status === "ok").length, fehler: amTag.filter((h) => h.status === "fehler").length };
  });

  const gruppiere = (liste, schluessel) => {
    const m = new Map();
    for (const x of liste) {
      const k = schluessel(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const herkunft = [...gruppiere(hbZ, (h) => herkunftName(h.werkzeug))].map(([name, l]) => ({
    name, anzahl: l.length, fehler: l.filter((h) => h.status === "fehler").length, dateien: l.reduce((s, h) => s + h.dateien, 0)
  })).sort((a, b) => b.anzahl - a.anzahl);
  const fehlermeldungen = [...gruppiere(hbZ.filter((h) => h.status === "fehler"), (h) => h.meldung || "ohne Meldung")].map(([meldung, l]) => ({
    meldung, anzahl: l.length, zuletzt: l[l.length - 1].erstellt, herkunft: [...new Set(l.map((h) => herkunftName(h.werkzeug)))].sort()
  })).sort((a, b) => b.anzahl - a.anzahl).slice(0, TOP);

  // Reife der Beschreibungen je Mandant (nur erfolgreiche Handbücher mit Kennzahlen)
  const reife = [...gruppiere(okZ.filter((h) => h.schritte !== null), (h) => h.mandant_id)].map(([mandantId, l]) => {
    const summe = (f) => l.reduce((s, h) => s + (h[f] || 0), 0);
    const mitZeichen = l.filter((h) => h.arbeitshilfe_zeichen !== null);
    const hilfenMitZeichen = mitZeichen.reduce((s, h) => s + h.mit_arbeitshilfe, 0);
    return {
      mandant_id: mandantId,
      organisation: l[0].organisation,
      handbuecher: l.length,
      schritte: summe("schritte"),
      mit_arbeitshilfe: summe("mit_arbeitshilfe"),
      mit_angaben: summe("mit_angaben"),
      fehlende_unterdiagramme: summe("fehlende_unterdiagramme"),
      // Durchschnittliche Länge einer vorhandenen Arbeitshilfe in Zeichen
      zeichen_je_arbeitshilfe: hilfenMitZeichen ? Math.round(mitZeichen.reduce((s, h) => s + h.arbeitshilfe_zeichen, 0) / hilfenMitZeichen) : null
    };
  }).sort((a, b) => b.schritte - a.schritte);

  const rueckZ = rueckmeldungen.filter(imZ).sort((a, b) => (a.zeit < b.zeit ? 1 : -1));
  return {
    zeitraum: z,
    erfasst_ab: handbuecher.length ? handbuecher[0].erstellt : null,
    kennzahlen_ab: (handbuecher.find((h) => h.schritte !== null) || {}).erstellt || null,
    bestandteile_ab: (handbuecher.find((h) => h.bestandteile) || {}).erstellt || null,
    seitenaufrufe_ab: seitenaufrufe.length ? seitenaufrufe[0].zeit : null,
    regeln: { wiederholung_min: WIEDERHOLUNG_MS / 60000, abbruch_min: ABBRUCH_MS / 60000 },
    kopf,
    tage,
    herkunft,
    fehlermeldungen,
    bestandteile: bestandteileZusammen(hbZ),
    wiederholungen: wiederholungen.filter(imZ).reverse().slice(0, LISTE),
    abbrueche: abbrueche.filter(imZ).slice(0, LISTE),
    reife,
    rueckmeldungen: {
      ohne: okZ.filter((h) => !rueckJeVorgang.has(h.vorgang)).length,
      liste: rueckZ.slice(0, LISTE).map(({ id, mandant_id, ...r }) => r)
    }
  };
}
