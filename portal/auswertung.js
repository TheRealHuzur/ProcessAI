// Auswertung der Nutzung aus dem Protokoll des Kontokerns: Sitzungen, aktive Mandanten, Verlauf je Mandant.
// Nur für die Verwaltung. Was die Module messen (z. B. Handbücher), werten die Module selbst aus.
import { zeitraumAus, imZeitraum, imVergleich, tagBerlin, wocheBerlin, tagPlus, tageDesZeitraums } from "./zeit.js";

const TAG_MS = 24 * 60 * 60 * 1000;
const WOCHEN = 12;
// Ab wie vielen Tagen ohne Aktivität ein Mandant als ruhig bzw. eingeschlafen gilt
const RUHIG_AB = 8;
const EINGESCHLAFEN_AB = 15;

const istSitzung = (e) => (e.aktion === "anmelden" && e.ergebnis === "ok") || e.aktion === "besuch";
const istAktivitaet = (e) => e.ergebnis === "ok";

function mitVergleich(ereignisse, z, wert) {
  return {
    wert: wert(ereignisse.filter((e) => imZeitraum(e.zeit, z))),
    vorher: z.vergleich_von ? wert(ereignisse.filter((e) => imVergleich(e.zeit, z))) : null
  };
}

const anzahlMandanten = (liste) => new Set(liste.filter(istAktivitaet).map((e) => e.mandant_id)).size;

export function portalAuswertung(db, { zeitraum, mandant = null, jetzt = new Date() } = {}) {
  const z = zeitraumAus(zeitraum, jetzt);
  const alleMandanten = db.prepare("SELECT id, name, benutzername, aktiv, angelegt FROM mandanten ORDER BY name COLLATE NOCASE").all();
  const ereignisse = db.prepare(`SELECT zeit, mandant_id, modul_id, aktion, ergebnis FROM protokoll
                                 WHERE mandant_id IS NOT NULL AND aktion NOT LIKE 'verwaltung:%' ORDER BY zeit`).all()
    .filter((e) => !mandant || e.mandant_id === mandant);

  const kopf = {
    aktive_mandanten: mitVergleich(ereignisse, z, anzahlMandanten),
    sitzungen: mitVergleich(ereignisse, z, (l) => l.filter(istSitzung).length),
    anmeldungen: mitVergleich(ereignisse, z, (l) => l.filter((e) => e.aktion === "anmelden" && e.ergebnis === "ok").length),
    fehlversuche: mitVergleich(ereignisse, z, (l) => l.filter((e) => e.aktion === "anmelden" && e.ergebnis === "fehler").length)
  };

  const tage = tageDesZeitraums(z, ereignisse[0] && ereignisse[0].zeit).map((tag) => {
    const amTag = ereignisse.filter((e) => tagBerlin(e.zeit) === tag);
    return { tag, sitzungen: amTag.filter(istSitzung).length, mandanten: anzahlMandanten(amTag) };
  });

  // Aktive Mandanten je Woche, unabhängig vom Zeitraum: die letzten zwölf Wochen
  const dieseWoche = wocheBerlin(jetzt);
  const wochen = Array.from({ length: WOCHEN }, (_, i) => tagPlus(dieseWoche, -7 * (WOCHEN - 1 - i))).map((start) => ({
    start,
    mandanten: anzahlMandanten(ereignisse.filter((e) => wocheBerlin(e.zeit) === start))
  }));

  const jetztMs = new Date(jetzt).getTime();
  const mandanten = alleMandanten.filter((m) => !mandant || m.id === mandant).map((m) => {
    const eigene = ereignisse.filter((e) => e.mandant_id === m.id);
    const aktiv = eigene.filter(istAktivitaet);
    const ersteAnmeldung = eigene.find((e) => e.aktion === "anmelden" && e.ergebnis === "ok");
    const erstesHandbuch = eigene.find((e) => e.aktion === "handbuch erstellt" && e.ergebnis === "ok");
    const zuletzt = aktiv.length ? aktiv[aktiv.length - 1].zeit : null;
    const tageSeit = zuletzt ? Math.floor((jetztMs - new Date(zuletzt).getTime()) / TAG_MS) : null;
    let status = "nie angemeldet";
    if (!m.aktiv) status = "gesperrt";
    else if (zuletzt) status = tageSeit < RUHIG_AB ? "aktiv" : tageSeit < EINGESCHLAFEN_AB ? "ruhig" : "eingeschlafen";
    return {
      id: m.id,
      name: m.name,
      benutzername: m.benutzername,
      angelegt: m.angelegt,
      status,
      erste_anmeldung: ersteAnmeldung ? ersteAnmeldung.zeit : null,
      erstes_handbuch: erstesHandbuch ? erstesHandbuch.zeit : null,
      // Zeit bis zum ersten Handbuch, gemessen ab der ersten Anmeldung, in Stunden
      stunden_bis_erstes_handbuch: ersteAnmeldung && erstesHandbuch
        ? Math.max(0, Math.round((new Date(erstesHandbuch.zeit) - new Date(ersteAnmeldung.zeit)) / 36e5 * 10) / 10)
        : null,
      aktive_tage: new Set(aktiv.map((e) => tagBerlin(e.zeit))).size,
      sitzungen: eigene.filter((e) => istSitzung(e) && imZeitraum(e.zeit, z)).length,
      fehlversuche: eigene.filter((e) => e.aktion === "anmelden" && e.ergebnis === "fehler" && imZeitraum(e.zeit, z)).length,
      zuletzt_aktiv: zuletzt,
      tage_seit: tageSeit
    };
  });

  return {
    zeitraum: z,
    erfasst_ab: ereignisse.length ? ereignisse[0].zeit : null,
    besuche_ab: (ereignisse.find((e) => e.aktion === "besuch") || {}).zeit || null,
    kopf,
    tage,
    wochen,
    mandanten,
    schwellen: { ruhig_ab_tagen: RUHIG_AB, eingeschlafen_ab_tagen: EINGESCHLAFEN_AB }
  };
}
