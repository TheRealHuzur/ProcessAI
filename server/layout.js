// Automatische Anordnung: Spalten nach Ablaufreihenfolge, Zeilen nach Rolle (Schwimmbahn).
// Die KI liefert keine Koordinaten. Alles hier ist deterministisch: gleiches Modell, gleiches Bild.

export const GROESSEN = {
  start: { w: 36, h: 36 },
  zwischen: { w: 36, h: 36 },
  ende: { w: 36, h: 36 },
  aufgabe: { w: 100, h: 80 },
  teilprozess: { w: 100, h: 80 },
  xor: { w: 50, h: 50 },
  und: { w: 50, h: 50 },
  ereignisgateway: { w: 50, h: 50 },
  datenobjekt: { w: 36, h: 50 },
  datenspeicher: { w: 50, h: 50 }
};

const POOL_X = 160;
const POOL_LABEL_W = 30;
const LANE_LABEL_W = 30;
const COL_W = 170;
const ROW_H = 130;
const DATA_ROW_H = 90;
const EXT_H = 70;
const EXT_GAP = 70;
const TOP = 60;
const RAND_LINKS = 70;
const RAND_RECHTS = 80;

const GATEWAYS = new Set(["xor", "und", "ereignisgateway"]);

function rangBerechnen(modell) {
  const ids = modell.elemente.map((e) => e.id);
  const aus = new Map(ids.map((id) => [id, []]));
  const ein = new Map(ids.map((id) => [id, []]));
  for (const fluss of modell.fluesse) {
    aus.get(fluss.von).push(fluss);
    ein.get(fluss.nach).push(fluss);
  }

  // Rückkanten (Schleifen) per Tiefensuche finden, damit die Rangfolge azyklisch bleibt.
  const rueckkanten = new Set();
  const zustand = new Map();
  const besuche = (id) => {
    zustand.set(id, "aktiv");
    for (const fluss of aus.get(id)) {
      const ziel = fluss.nach;
      if (zustand.get(ziel) === "aktiv") {
        rueckkanten.add(fluss.id);
      } else if (!zustand.has(ziel)) {
        besuche(ziel);
      }
    }
    zustand.set(id, "fertig");
  };
  const starts = modell.elemente.filter((e) => e.typ === "start").map((e) => e.id);
  for (const id of [...starts, ...ids]) {
    if (!zustand.has(id)) besuche(id);
  }

  // Längster Pfad auf dem azyklischen Rest (Kahn).
  const rang = new Map(ids.map((id) => [id, 0]));
  const restEin = new Map(ids.map((id) => [id, ein.get(id).filter((fl) => !rueckkanten.has(fl.id)).length]));
  const warteschlange = ids.filter((id) => restEin.get(id) === 0);
  const reihenfolge = [];
  while (warteschlange.length) {
    const id = warteschlange.shift();
    reihenfolge.push(id);
    for (const fluss of aus.get(id)) {
      if (rueckkanten.has(fluss.id)) continue;
      rang.set(fluss.nach, Math.max(rang.get(fluss.nach), rang.get(id) + 1));
      restEin.set(fluss.nach, restEin.get(fluss.nach) - 1);
      if (restEin.get(fluss.nach) === 0) warteschlange.push(fluss.nach);
    }
  }
  for (const id of ids) {
    if (!reihenfolge.includes(id)) reihenfolge.push(id);
  }

  return { rang, reihenfolge, ein, aus, rueckkanten };
}

function mitte(b) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function punkt(x, y) {
  return { x: Math.round(x), y: Math.round(y) };
}

function sequenzWeg(s, t, sTyp, tTyp, istRueckkante) {
  const sm = mitte(s);
  const tm = mitte(t);

  if (istRueckkante || tm.x <= sm.x) {
    // Unter der Zeile zurückführen: unterhalb aller Formen dieser Zeile
    const y = Math.max(sm.y, tm.y) + ROW_H / 2 - 10;
    return [punkt(sm.x, s.y + s.h), punkt(sm.x, y), punkt(tm.x, y), punkt(tm.x, t.y + t.h)];
  }

  if (Math.abs(sm.y - tm.y) < 1) {
    return [punkt(s.x + s.w, sm.y), punkt(t.x, tm.y)];
  }

  if (GATEWAYS.has(sTyp)) {
    const ausY = tm.y < sm.y ? s.y : s.y + s.h;
    return [punkt(sm.x, ausY), punkt(sm.x, tm.y), punkt(t.x, tm.y)];
  }

  if (GATEWAYS.has(tTyp)) {
    const einY = sm.y < tm.y ? t.y : t.y + t.h;
    return [punkt(s.x + s.w, sm.y), punkt(tm.x, sm.y), punkt(tm.x, einY)];
  }

  const mx = t.x - 30;
  return [punkt(s.x + s.w, sm.y), punkt(mx, sm.y), punkt(mx, tm.y), punkt(t.x, tm.y)];
}

function senkrechtBlockiert(x, y1, y2, shapes, ausser) {
  const oben = Math.min(y1, y2);
  const unten = Math.max(y1, y2);
  for (const [id, b] of shapes) {
    if (id === ausser) continue;
    if (x > b.x - 4 && x < b.x + b.w + 4 && b.y < unten && b.y + b.h > oben) return true;
  }
  return false;
}

export function anordnen(modell) {
  const { rang, reihenfolge, ein, rueckkanten } = rangBerechnen(modell);
  const byId = new Map(modell.elemente.map((e) => [e.id, e]));

  const mitBahnen = modell.rollen.length >= 2;
  const bahnen = modell.rollen.length > 0 ? modell.rollen : [{ id: "", name: "" }];
  const bahnIndex = new Map(bahnen.map((b, i) => [b.id, i]));
  const bahnVon = (rolle) => (bahnIndex.has(rolle) ? bahnIndex.get(rolle) : 0);

  // Unterzeilen je Bahn und Spalte vergeben; Zweige behalten möglichst ihre Zeile.
  const belegt = new Map();
  const zeile = new Map();
  for (const id of reihenfolge) {
    const element = byId.get(id);
    const bahn = bahnVon(element.rolle);
    const r = rang.get(id);
    let bevorzugt = 0;
    const vorgaenger = ein.get(id).filter((fl) => !rueckkanten.has(fl.id)).map((fl) => fl.von);
    const gleicheBahn = vorgaenger.find((v) => bahnVon(byId.get(v).rolle) === bahn && zeile.has(v));
    if (gleicheBahn) bevorzugt = zeile.get(gleicheBahn);
    const zelle = `${bahn}:${r}`;
    const frei = belegt.get(zelle) || new Set();
    let z = bevorzugt;
    while (frei.has(z)) z += 1;
    frei.add(z);
    belegt.set(zelle, frei);
    zeile.set(id, z);
  }

  const zeilenJeBahn = bahnen.map(() => 1);
  for (const [id, z] of zeile) {
    const bahn = bahnVon(byId.get(id).rolle);
    zeilenJeBahn[bahn] = Math.max(zeilenJeBahn[bahn], z + 1);
  }
  const datenJeBahn = bahnen.map(() => false);
  for (const daten of modell.daten) {
    datenJeBahn[bahnVon(daten.rolle)] = true;
  }

  const maxRang = Math.max(0, ...rang.values());
  const inhaltX = POOL_X + POOL_LABEL_W + (mitBahnen ? LANE_LABEL_W : 0);
  const spalteX = (r) => inhaltX + RAND_LINKS + r * COL_W;
  const poolBreite = inhaltX - POOL_X + RAND_LINKS + maxRang * COL_W + RAND_RECHTS + 40;

  const externOben = modell.externe.filter((_, i) => i % 2 === 0);
  const externUnten = modell.externe.filter((_, i) => i % 2 === 1);

  const poolY = TOP + externOben.length * (EXT_H + EXT_GAP);
  const bahnHoehen = bahnen.map((_, i) => zeilenJeBahn[i] * ROW_H + (datenJeBahn[i] ? DATA_ROW_H : 0));
  const bahnY = [];
  let y = poolY;
  for (const hoehe of bahnHoehen) {
    bahnY.push(y);
    y += hoehe;
  }
  const poolHoehe = y - poolY;

  const pool = { x: POOL_X, y: poolY, w: poolBreite, h: poolHoehe };
  const lanes = mitBahnen
    ? bahnen.map((b, i) => ({ id: b.id, bounds: { x: POOL_X + POOL_LABEL_W, y: bahnY[i], w: poolBreite - POOL_LABEL_W, h: bahnHoehen[i] } }))
    : [];

  const shapes = new Map();
  for (const element of modell.elemente) {
    const g = GROESSEN[element.typ];
    const bahn = bahnVon(element.rolle);
    const cx = spalteX(rang.get(element.id));
    const cy = bahnY[bahn] + zeile.get(element.id) * ROW_H + ROW_H / 2;
    shapes.set(element.id, { x: Math.round(cx - g.w / 2), y: Math.round(cy - g.h / 2), w: g.w, h: g.h });
  }

  const datenBelegt = new Map();
  for (const daten of modell.daten) {
    const g = GROESSEN[daten.typ];
    const bahn = bahnVon(daten.rolle);
    const bezug = shapes.get(daten.schreiben[0] || daten.lesen[0]);
    const bezugR = rang.get(daten.schreiben[0] || daten.lesen[0]) || 0;
    const zelle = `${bahn}:${bezugR}`;
    const n = datenBelegt.get(zelle) || 0;
    datenBelegt.set(zelle, n + 1);
    const cx = (bezug ? bezug.x + bezug.w / 2 : spalteX(bezugR)) + n * 55;
    const cy = bahnY[bahn] + zeilenJeBahn[bahn] * ROW_H + DATA_ROW_H / 2 - 5;
    shapes.set(daten.id, { x: Math.round(cx - g.w / 2), y: Math.round(cy - g.h / 2), w: g.w, h: g.h });
  }

  const externPools = new Map();
  externOben.forEach((extern, i) => {
    externPools.set(extern.id, { oben: true, bounds: { x: POOL_X, y: TOP + i * (EXT_H + EXT_GAP), w: poolBreite, h: EXT_H } });
  });
  externUnten.forEach((extern, i) => {
    externPools.set(extern.id, { oben: false, bounds: { x: POOL_X, y: poolY + poolHoehe + EXT_GAP + i * (EXT_H + EXT_GAP), w: poolBreite, h: EXT_H } });
  });

  const kanten = new Map();
  for (const fluss of modell.fluesse) {
    const s = shapes.get(fluss.von);
    const t = shapes.get(fluss.nach);
    kanten.set(fluss.id, sequenzWeg(s, t, byId.get(fluss.von).typ, byId.get(fluss.nach).typ, rueckkanten.has(fluss.id)));
  }

  const versatz = new Map();
  for (const nachricht of modell.nachrichten) {
    const externId = externPools.has(nachricht.von) ? nachricht.von : nachricht.nach;
    const elementId = externId === nachricht.von ? nachricht.nach : nachricht.von;
    const ext = externPools.get(externId);
    const shape = shapes.get(elementId);
    const n = versatz.get(elementId) || 0;
    versatz.set(elementId, n + 1);
    const x = shape.x + shape.w / 2 + (n === 0 ? 0 : (n % 2 === 1 ? 14 : -14) * Math.ceil(n / 2));
    const randExtern = ext.oben ? ext.bounds.y + ext.bounds.h : ext.bounds.y;
    const randElement = ext.oben ? shape.y : shape.y + shape.h;
    let weg = [punkt(x, randExtern), punkt(x, randElement)];
    if (senkrechtBlockiert(x, randExtern, randElement, shapes, elementId)) {
      // Umweg über die Lücke zwischen den Spalten, damit keine Form durchkreuzt wird
      const xLuecke = shape.x + shape.w / 2 + COL_W / 2 + (n % 3) * 8;
      const yKnick = ext.oben ? shape.y - 18 : shape.y + shape.h + 18;
      weg = [punkt(xLuecke, randExtern), punkt(xLuecke, yKnick), punkt(x, yKnick), punkt(x, randElement)];
    }
    kanten.set(nachricht.id, externId === nachricht.von ? weg : weg.reverse());
  }

  for (const daten of modell.daten) {
    const d = shapes.get(daten.id);
    const dOben = punkt(d.x + d.w / 2, d.y);
    for (const ziel of daten.lesen) {
      const t = shapes.get(ziel);
      kanten.set(`DIA_${daten.id}_${ziel}`, [dOben, punkt(t.x + t.w / 2, t.y + t.h)]);
    }
    for (const quelle of daten.schreiben) {
      const s = shapes.get(quelle);
      kanten.set(`DOA_${quelle}_${daten.id}`, [punkt(s.x + s.w / 2, s.y + s.h), dOben]);
    }
  }

  return { pool, lanes, shapes, externPools, kanten, mitBahnen };
}
