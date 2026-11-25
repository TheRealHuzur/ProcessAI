// Zeiträume und Tage für die Auswertung, gezählt nach deutscher Zeit (Europe/Berlin).
export const ZEITRAEUME = { 7: "7 Tage", 30: "30 Tage", 90: "90 Tage", alle: "Gesamt" };

const tagFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

// "2026-11-25" für einen Zeitpunkt (ISO-Text oder Date)
export function tagBerlin(zeit) {
  return tagFormat.format(new Date(zeit));
}

// Montag der Woche als Tag
export function wocheBerlin(zeit) {
  const tag = new Date(`${tagBerlin(zeit)}T12:00:00Z`);
  tag.setUTCDate(tag.getUTCDate() - ((tag.getUTCDay() + 6) % 7));
  return tag.toISOString().slice(0, 10);
}

// Alle Tage von bis einschließlich (Tage als "JJJJ-MM-TT")
export function tageZwischen(vonTag, bisTag) {
  const tage = [];
  const t = new Date(`${vonTag}T12:00:00Z`);
  const ende = new Date(`${bisTag}T12:00:00Z`);
  while (t <= ende && tage.length < 2000) {
    tage.push(t.toISOString().slice(0, 10));
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return tage;
}

// Tag um n Tage verschoben
export function tagPlus(tag, n) {
  const t = new Date(`${tag}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// Zeitraum aus der Anfrage in ganzen Kalendertagen: die letzten 7, 30 oder 90 Tage einschließlich heute,
// dazu der gleich lange Vorzeitraum zum Vergleich; oder alles ohne Vergleich
export function zeitraumAus(schluessel, jetzt = new Date()) {
  const s = Object.hasOwn(ZEITRAEUME, String(schluessel)) ? String(schluessel) : "30";
  const bis = tagBerlin(jetzt);
  if (s === "alle") return { schluessel: s, name: ZEITRAEUME[s], von: null, bis, vergleich_von: null, vergleich_bis: null, jetzt: new Date(jetzt).toISOString() };
  const n = Number(s);
  const von = tagPlus(bis, -(n - 1));
  return { schluessel: s, name: ZEITRAEUME[s], von, bis, vergleich_von: tagPlus(von, -n), vergleich_bis: tagPlus(von, -1), jetzt: new Date(jetzt).toISOString() };
}

// Liegt ein Zeitpunkt (ISO) im Zeitraum bzw. im Vorzeitraum?
export function imZeitraum(zeit, z) {
  const t = tagBerlin(zeit);
  return (!z.von || t >= z.von) && t <= z.bis;
}
export function imVergleich(zeit, z) {
  if (!z.vergleich_von) return false;
  const t = tagBerlin(zeit);
  return t >= z.vergleich_von && t <= z.vergleich_bis;
}

// Tage für die Balken: im Zeitraum, bei "alle" ab dem ersten Eintrag
export function tageDesZeitraums(z, ersterEintrag) {
  return tageZwischen(z.von || (ersterEintrag ? tagBerlin(ersterEintrag) : z.bis), z.bis);
}
