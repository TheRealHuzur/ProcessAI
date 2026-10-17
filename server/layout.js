// Automatische Anordnung und Linienführung: Spalten nach Ablaufreihenfolge, Zeilen nach Rolle (Schwimmbahn).
// Die KI liefert keine Koordinaten. Alles hier ist deterministisch: gleiches Modell, gleiches Bild.
// Darstellungsregeln: docs/bpmn-regelwerk.md, Abschnitt 17.
//
// Vorgehen:
// 1. Rang (Spalte) je Element über den längsten Pfad, Rückkanten (Schleifen) ausgenommen.
// 2. Zeilen je Bahn; die Ausgänge verzweigender Gateways bekommen eine Reihenfolge (wer bleibt in der Zeile).
// 3. Linienführung: Für jede Verbindung werden mögliche Wege über Spaltenlücken, Zeilengrenzen und
//    Laufkorridore am Bahnrand erzeugt und bewertet (durch Symbole, Kreuzungen, Abstand zur Bahngrenze, Knicke).
// 4. Für jedes verzweigende Gateway wird geprüft, ob eine andere Reihenfolge der Ausgänge besser ist.

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
const DATA_H = 90;
const EXT_H = 70;
const EXT_GAP = 70;
const TOP = 60;
const RAND_LINKS = 70;
const RAND_RECHTS = 80;
// Abstand zwischen Aktivität und Bahngrenze. Derselbe Mindestabstand gilt für Sequenzflüsse (Regel 17.4).
export const ABSTAND_BAHN = (ROW_H - GROESSEN.aufgabe.h) / 2;
const SPUR = 14;
const SPUREN_PROBE = 4;
const DATEN_ABSTAND = 44;

const KOSTEN = {
  form: 1000,
  ueberlagerung: 400,
  bahngrenze: 300,
  seiteDoppelt: 200,
  kreuzung: 40,
  korridor: 15,
  zeile: 10,
  knick: 8,
  laenge: 0.02
};

const GATEWAYS = new Set(["xor", "und", "ereignisgateway"]);
const RICHTUNG = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };

// ---------------------------------------------------------------------------
// Datenobjekte und Datenspeicher: je Aufgabe eine eigene Darstellung (Regel 16)

export function datenDarstellungen(modell) {
  const refs = [];
  for (const daten of modell.daten) {
    const elemente = [...new Set([...daten.schreiben, ...daten.lesen])];
    if (elemente.length > 1) {
      for (const element of elemente) {
        refs.push({
          id: `${daten.id}_${element}`,
          daten,
          anker: element,
          lesen: daten.lesen.includes(element) ? [element] : [],
          schreiben: daten.schreiben.includes(element) ? [element] : []
        });
      }
    } else {
      refs.push({ id: daten.id, daten, anker: elemente[0], lesen: daten.lesen, schreiben: daten.schreiben });
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Rang und Reihenfolge

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

function grundlagen(modell) {
  const basis = rangBerechnen(modell);
  const byId = new Map(modell.elemente.map((e) => [e.id, e]));
  const bahnen = modell.rollen.length > 0 ? modell.rollen : [{ id: "", name: "" }];
  const bahnIndex = new Map(bahnen.map((b, i) => [b.id, i]));
  const bahnVon = (rolle) => (bahnIndex.has(rolle) ? bahnIndex.get(rolle) : 0);
  const refs = datenDarstellungen(modell);
  return { ...basis, byId, bahnen, bahnVon, refs, mitBahnen: modell.rollen.length >= 2 };
}

// Verzweigende Gateways und ihre Nachfolger in derselben Bahn. Der erste Nachfolger bleibt in der Zeile
// des Gateways, die weiteren rücken darunter. Voreinstellung: der Nachfolger mit dem höchsten Rang zuerst,
// damit ein überspringender Pfad gerade durchläuft und die Zwischenschritte darunter liegen.
function verzweigungen(basis) {
  const wahl = new Map();
  for (const id of basis.reihenfolge) {
    const element = basis.byId.get(id);
    if (!GATEWAYS.has(element.typ)) continue;
    const bahn = basis.bahnVon(element.rolle);
    const nachfolger = [];
    for (const fluss of basis.aus.get(id)) {
      if (basis.rueckkanten.has(fluss.id)) continue;
      if (basis.bahnVon(basis.byId.get(fluss.nach).rolle) !== bahn) continue;
      if (!nachfolger.includes(fluss.nach)) nachfolger.push(fluss.nach);
    }
    if (nachfolger.length < 2) continue;
    const sortiert = nachfolger
      .map((n, i) => ({ n, i, r: basis.rang.get(n) }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .map((x) => x.n);
    wahl.set(id, sortiert);
  }
  return wahl;
}

function zeilenZuweisen(basis, wahl) {
  const { reihenfolge, rang, ein, rueckkanten, byId, bahnVon } = basis;
  const belegt = new Map();
  const zeile = new Map();
  for (const id of reihenfolge) {
    const bahn = bahnVon(byId.get(id).rolle);
    let bevorzugt = null;
    for (const fluss of ein.get(id)) {
      if (rueckkanten.has(fluss.id)) continue;
      const v = fluss.von;
      if (!zeile.has(v) || bahnVon(byId.get(v).rolle) !== bahn) continue;
      const reihe = wahl.get(v);
      const versatz = reihe ? Math.max(0, reihe.indexOf(id)) : 0;
      const kandidat = zeile.get(v) + versatz;
      if (bevorzugt === null || kandidat < bevorzugt) bevorzugt = kandidat;
    }
    let z = bevorzugt ?? 0;
    const zelle = `${bahn}:${rang.get(id)}`;
    const frei = belegt.get(zelle) || new Set();
    while (frei.has(z)) z += 1;
    frei.add(z);
    belegt.set(zelle, frei);
    zeile.set(id, z);
  }
  return zeile;
}

// ---------------------------------------------------------------------------
// Geometrie: Bahnen, Zeilenbänder, Korridore, Formen

function geometrie(modell, basis, zeile, korridore) {
  const { bahnen, bahnVon, byId, rang, refs, mitBahnen } = basis;

  const zeilenJeBahn = bahnen.map(() => 1);
  for (const [id, z] of zeile) {
    const bahn = bahnVon(byId.get(id).rolle);
    zeilenJeBahn[bahn] = Math.max(zeilenJeBahn[bahn], z + 1);
  }
  const datenZeilen = bahnen.map(() => new Set());
  for (const ref of refs) {
    const anker = byId.get(ref.anker);
    if (anker) datenZeilen[bahnVon(anker.rolle)].add(zeile.get(anker.id));
  }

  const maxRang = Math.max(0, ...rang.values());
  const inhaltX = POOL_X + POOL_LABEL_W + (mitBahnen ? LANE_LABEL_W : 0);
  const spalteX = (r) => inhaltX + RAND_LINKS + r * COL_W;
  const poolBreite = inhaltX - POOL_X + RAND_LINKS + maxRang * COL_W + RAND_RECHTS + 40;

  const externOben = modell.externe.filter((_, i) => i % 2 === 0);
  const externUnten = modell.externe.filter((_, i) => i % 2 === 1);
  const poolY = TOP + externOben.length * (EXT_H + EXT_GAP);

  const bahnGeo = [];
  let y = poolY;
  bahnen.forEach((bahn, i) => {
    const top = y;
    const oben = korridore[i].oben;
    const unten = korridore[i].unten;
    let yy = top + (oben ? ABSTAND_BAHN + (oben - 1) * SPUR : 0);
    const baender = [];
    for (let r = 0; r < zeilenJeBahn[i]; r += 1) {
      const h = ROW_H + (datenZeilen[i].has(r) ? DATA_H : 0);
      baender.push({ top: yy, h, mitte: yy + ROW_H / 2 });
      yy += h;
    }
    const bottom = yy + (unten ? ABSTAND_BAHN + (unten - 1) * SPUR : 0);
    bahnGeo.push({ id: bahn.id, top, bottom, baender, oben, unten });
    y = bottom;
  });
  const poolHoehe = y - poolY;
  const pool = { x: POOL_X, y: poolY, w: poolBreite, h: poolHoehe };

  const shapes = new Map();
  for (const element of modell.elemente) {
    const g = GROESSEN[element.typ];
    const band = bahnGeo[bahnVon(element.rolle)].baender[zeile.get(element.id)];
    const cx = spalteX(rang.get(element.id));
    shapes.set(element.id, { x: Math.round(cx - g.w / 2), y: Math.round(band.mitte - g.h / 2), w: g.w, h: g.h });
  }

  const jeAnker = new Map();
  for (const ref of refs) {
    if (!jeAnker.has(ref.anker)) jeAnker.set(ref.anker, []);
    jeAnker.get(ref.anker).push(ref);
  }
  for (const [ankerId, liste] of jeAnker) {
    const anker = byId.get(ankerId);
    const a = shapes.get(ankerId);
    if (!anker || !a) continue;
    const band = bahnGeo[bahnVon(anker.rolle)].baender[zeile.get(ankerId)];
    liste.forEach((ref, i) => {
      const g = GROESSEN[ref.daten.typ];
      const cx = a.x + a.w / 2 + (i - (liste.length - 1) / 2) * DATEN_ABSTAND;
      shapes.set(ref.id, { x: Math.round(cx - g.w / 2), y: Math.round(band.top + ROW_H - 5), w: g.w, h: g.h });
    });
  }

  const externPools = new Map();
  externOben.forEach((extern, i) => {
    externPools.set(extern.id, { oben: true, bounds: { x: POOL_X, y: TOP + i * (EXT_H + EXT_GAP), w: poolBreite, h: EXT_H } });
  });
  externUnten.forEach((extern, i) => {
    externPools.set(extern.id, { oben: false, bounds: { x: POOL_X, y: poolY + poolHoehe + EXT_GAP + i * (EXT_H + EXT_GAP), w: poolBreite, h: EXT_H } });
  });

  // Kanäle für die Linienführung
  const kanaeleV = [];
  for (let r = 0; r <= maxRang; r += 1) {
    const basisX = spalteX(r) + COL_W / 2;
    kanaeleV.push({ id: `V${r}`, spuren: [basisX, basisX + 10, basisX - 10, basisX + 20, basisX - 20].map(Math.round) });
  }
  const kanaeleH = [];
  bahnGeo.forEach((b, i) => {
    if (b.oben) kanaeleH.push({ id: `O${i}`, korridor: true, spuren: Array.from({ length: b.oben }, (_, k) => b.top + ABSTAND_BAHN + k * SPUR) });
    for (let j = 1; j < b.baender.length; j += 1) {
      const basisY = b.baender[j].top;
      kanaeleH.push({ id: `I${i}_${j}`, korridor: false, spuren: [basisY, basisY + 8, basisY - 8] });
    }
    if (b.unten) kanaeleH.push({ id: `U${i}`, korridor: true, spuren: Array.from({ length: b.unten }, (_, k) => b.bottom - ABSTAND_BAHN - k * SPUR) });
  });

  const grenzen = [...new Set(bahnGeo.flatMap((b) => [b.top, b.bottom]))];

  return { pool, bahnGeo, shapes, externPools, kanaeleV, kanaeleH, grenzen, poolBreite, zeilenSumme: zeilenJeBahn.reduce((a, b) => a + b, 0) };
}

// ---------------------------------------------------------------------------
// Linienführung

function port(b, seite) {
  switch (seite) {
    case "r": return { x: b.x + b.w, y: b.y + b.h / 2 };
    case "l": return { x: b.x, y: b.y + b.h / 2 };
    case "t": return { x: b.x + b.w / 2, y: b.y };
    default: return { x: b.x + b.w / 2, y: b.y + b.h };
  }
}

function punkt(x, y) {
  return { x: Math.round(x), y: Math.round(y) };
}

function vereinfachen(pts) {
  const p = [];
  for (const q of pts.map((x) => punkt(x.x, x.y))) {
    const letzter = p[p.length - 1];
    if (letzter && letzter.x === q.x && letzter.y === q.y) continue;
    p.push(q);
  }
  for (let i = 1; i < p.length - 1; ) {
    const a = p[i - 1];
    const b = p[i];
    const c = p[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) p.splice(i, 1);
    else i += 1;
  }
  return p;
}

function segmente(pts) {
  const s = [];
  for (let i = 0; i < pts.length - 1; i += 1) s.push({ a: pts[i], b: pts[i + 1] });
  return s;
}

function trifftBox(seg, b, rand) {
  const x1 = Math.min(seg.a.x, seg.b.x);
  const x2 = Math.max(seg.a.x, seg.b.x);
  const y1 = Math.min(seg.a.y, seg.b.y);
  const y2 = Math.max(seg.a.y, seg.b.y);
  return x2 > b.x - rand && x1 < b.x + b.w + rand && y2 > b.y - rand && y1 < b.y + b.h + rand;
}

// Kreuzung (senkrecht, im Inneren beider Segmente) oder Überlagerung (parallel, gleiche Linie)
function vergleiche(s, t) {
  const sH = s.a.y === s.b.y;
  const tH = t.a.y === t.b.y;
  if (sH !== tH) {
    const h = sH ? s : t;
    const v = sH ? t : s;
    const hx1 = Math.min(h.a.x, h.b.x);
    const hx2 = Math.max(h.a.x, h.b.x);
    const vy1 = Math.min(v.a.y, v.b.y);
    const vy2 = Math.max(v.a.y, v.b.y);
    if (v.a.x > hx1 + 1 && v.a.x < hx2 - 1 && h.a.y > vy1 + 1 && h.a.y < vy2 - 1) return "kreuzung";
    return null;
  }
  if (sH) {
    if (Math.abs(s.a.y - t.a.y) >= 4) return null;
    const ueber = Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x)) - Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x));
    return ueber > 4 ? "ueberlagerung" : null;
  }
  if (Math.abs(s.a.x - t.a.x) >= 4) return null;
  const ueber = Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y)) - Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y));
  return ueber > 4 ? "ueberlagerung" : null;
}

function neuerZustand() {
  return { segs: [], belegung: new Map(), seiten: new Map(), log: [] };
}

function marke(z) {
  return z.log.length;
}

function zurueck(z, m) {
  while (z.log.length > m) z.log.pop()();
}

function spurFrei(z, key, a, b) {
  const liste = z.belegung.get(key) || [];
  const lo = Math.min(a, b) - 12;
  const hi = Math.max(a, b) + 12;
  return liste.every(([x, y]) => hi <= x || lo >= y);
}

function freieSpur(z, kanal, a, b) {
  for (let i = 0; i < kanal.spuren.length; i += 1) {
    if (spurFrei(z, `${kanal.id}:${i}`, a, b)) return { key: `${kanal.id}:${i}`, wert: kanal.spuren[i], a: Math.min(a, b), b: Math.max(a, b) };
  }
  return null;
}

function festschreiben(z, kante, weg, quelleId, zielId, quelleGw, zielGw) {
  const neu = segmente(weg.pts).map((s) => ({ ...s, kante }));
  z.segs.push(...neu);
  z.log.push(() => {
    z.segs.length -= neu.length;
  });
  for (const b of weg.belegungen) {
    if (!z.belegung.has(b.key)) z.belegung.set(b.key, []);
    z.belegung.get(b.key).push([b.a, b.b]);
    z.log.push(() => z.belegung.get(b.key).pop());
  }
  const seite = (id, s) => {
    if (!z.seiten.has(id)) z.seiten.set(id, new Set());
    const set = z.seiten.get(id);
    if (set.has(s)) return;
    set.add(s);
    z.log.push(() => set.delete(s));
  };
  if (quelleGw) seite(quelleId, weg.sp);
  if (zielGw) seite(zielId, weg.sq);
}

// Liegt ein Wert in Austrittsrichtung der Seite (mit Mindestabstand)?
function aussen(p, seite, wert) {
  const [dx, dy] = RICHTUNG[seite];
  return dx !== 0 ? (wert - p.x) * dx > 5 : (wert - p.y) * dy > 5;
}

function naechsteLuecken(kanaele, p, seite, anzahl) {
  return kanaele
    .filter((k) => aussen(p, seite, k.spuren[0]))
    .sort((a, b) => Math.abs(a.spuren[0] - p.x) - Math.abs(b.spuren[0] - p.x))
    .slice(0, anzahl);
}

// Mögliche Wege von P (Seite sp) nach Q (Seite sq). Jede Seite gilt als Austritt bzw. Eintritt von außen.
function wegeErzeugen(z, geo, P, sp, Q, sq) {
  const wege = [];
  const hP = sp === "r" || sp === "l";
  const hQ = sq === "r" || sq === "l";
  const neu = (pts, belegungen = [], korridore = 0) => wege.push({ pts, belegungen, korridore });

  if (hP && hQ) {
    if (Math.abs(P.y - Q.y) < 1 && aussen(P, sp, Q.x) && aussen(Q, sq, P.x)) neu([P, Q]);
    for (const k of geo.kanaeleV) {
      const x = k.spuren[0];
      if (!aussen(P, sp, x) || !aussen(Q, sq, x)) continue;
      const s = freieSpur(z, k, P.y, Q.y);
      if (s) neu([P, { x: s.wert, y: P.y }, { x: s.wert, y: Q.y }, Q], [s]);
    }
    for (const k1 of naechsteLuecken(geo.kanaeleV, P, sp, 2)) {
      for (const k2 of naechsteLuecken(geo.kanaeleV, Q, sq, 2)) {
        for (const kh of geo.kanaeleH) {
          const yh = kh.spuren[0];
          const s1 = freieSpur(z, k1, P.y, yh);
          const s2 = k2 === k1 ? null : freieSpur(z, k2, yh, Q.y);
          if (!s1 || (!s2 && k2 !== k1)) continue;
          const x2 = s2 ? s2.wert : s1.wert;
          const sh = freieSpur(z, kh, s1.wert, x2);
          if (!sh) continue;
          neu([P, { x: s1.wert, y: P.y }, { x: s1.wert, y: sh.wert }, { x: x2, y: sh.wert }, { x: x2, y: Q.y }, Q], [s1, sh, ...(s2 ? [s2] : [])], kh.korridor ? 1 : 0);
        }
      }
    }
  } else if (hP && !hQ) {
    if (aussen(P, sp, Q.x) && aussen(Q, sq, P.y)) neu([P, { x: Q.x, y: P.y }, Q]);
    for (const k of naechsteLuecken(geo.kanaeleV, P, sp, 3)) {
      for (const kh of geo.kanaeleH) {
        if (!aussen(Q, sq, kh.spuren[0])) continue;
        const sv = freieSpur(z, k, P.y, kh.spuren[0]);
        if (!sv) continue;
        const sh = freieSpur(z, kh, sv.wert, Q.x);
        if (!sh || !aussen(Q, sq, sh.wert)) continue;
        neu([P, { x: sv.wert, y: P.y }, { x: sv.wert, y: sh.wert }, { x: Q.x, y: sh.wert }, Q], [sv, sh], kh.korridor ? 1 : 0);
      }
    }
  } else if (!hP && hQ) {
    if (aussen(P, sp, Q.y) && aussen(Q, sq, P.x)) neu([P, { x: P.x, y: Q.y }, Q]);
    for (const k of naechsteLuecken(geo.kanaeleV, Q, sq, 3)) {
      for (const kh of geo.kanaeleH) {
        if (!aussen(P, sp, kh.spuren[0])) continue;
        const sv = freieSpur(z, k, kh.spuren[0], Q.y);
        if (!sv) continue;
        const sh = freieSpur(z, kh, P.x, sv.wert);
        if (!sh || !aussen(P, sp, sh.wert)) continue;
        neu([P, { x: P.x, y: sh.wert }, { x: sv.wert, y: sh.wert }, { x: sv.wert, y: Q.y }, Q], [sv, sh], kh.korridor ? 1 : 0);
      }
    }
  } else {
    if (Math.abs(P.x - Q.x) < 1 && aussen(P, sp, Q.y) && aussen(Q, sq, P.y)) neu([P, Q]);
    for (const kh of geo.kanaeleH) {
      const sh = freieSpur(z, kh, P.x, Q.x);
      if (!sh || !aussen(P, sp, sh.wert) || !aussen(Q, sq, sh.wert)) continue;
      neu([P, { x: P.x, y: sh.wert }, { x: Q.x, y: sh.wert }, Q], [sh], kh.korridor ? 1 : 0);
    }
  }
  return wege;
}

function wegKosten(z, geo, pts, quelleId, zielId, korridore) {
  const segs = segmente(pts);
  let kosten = (pts.length - 2) * KOSTEN.knick + korridore * KOSTEN.korridor;
  segs.forEach((s, i) => {
    kosten += (Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y)) * KOSTEN.laenge;
    for (const [id, box] of geo.shapes) {
      if (i === 0 && id === quelleId) continue;
      if (i === segs.length - 1 && id === zielId) continue;
      if (trifftBox(s, box, 6)) kosten += KOSTEN.form;
    }
    if (s.a.y === s.b.y && s.a.x !== s.b.x) {
      if (geo.grenzen.some((g) => Math.abs(s.a.y - g) < ABSTAND_BAHN - 1)) kosten += KOSTEN.bahngrenze;
    }
    for (const t of z.segs) {
      const art = vergleiche(s, t);
      if (art === "kreuzung") kosten += KOSTEN.kreuzung;
      else if (art === "ueberlagerung") kosten += KOSTEN.ueberlagerung;
    }
  });
  return kosten;
}

function routen(modell, basis, geo) {
  const { byId, aus, ein, rueckkanten, reihenfolge } = basis;
  const z = neuerZustand();
  const kanten = new Map();
  let summe = 0;
  const istGw = (id) => GATEWAYS.has(byId.get(id).typ);

  // Linke Kante einer Zusammenführung bleibt dem geraden Vorgänger vorbehalten (gleiche Höhe, links davon).
  const linksReserviert = new Map();
  for (const element of modell.elemente) {
    if (!istGw(element.id)) continue;
    const ziel = geo.shapes.get(element.id);
    const gerade = ein.get(element.id).find((fl) => {
      if (rueckkanten.has(fl.id) || istGw(fl.von)) return false;
      const q = geo.shapes.get(fl.von);
      return Math.abs(q.y + q.h / 2 - (ziel.y + ziel.h / 2)) < 1 && q.x < ziel.x;
    });
    if (gerade) linksReserviert.set(element.id, gerade.id);
  }

  const seitenFrei = (id, reihenfolgeSeiten) => {
    const belegt = z.seiten.get(id) || new Set();
    return reihenfolgeSeiten.filter((s) => !belegt.has(s));
  };
  const seitenAus = (id) => (istGw(id) ? seitenFrei(id, ["r", "b", "t", "l"]) : ["r"]);
  const seitenEin = (id, fluss) => {
    if (!istGw(id)) return ["l"];
    let frei = seitenFrei(id, ["l", "t", "b", "r"]);
    const reserviert = linksReserviert.get(id);
    if (reserviert && reserviert !== fluss.id) frei = frei.filter((s) => s !== "l");
    return frei;
  };

  const bester = (fluss, aussenSeiten, innenSeiten) => {
    const s = geo.shapes.get(fluss.von);
    const t = geo.shapes.get(fluss.nach);
    const quelleSeiten = aussenSeiten.length ? aussenSeiten : ["r", "b", "t", "l"];
    const zielSeiten = innenSeiten.length ? innenSeiten : ["l", "t", "b", "r"];
    let best = null;
    for (const sp of quelleSeiten) {
      for (const sq of zielSeiten) {
        const P = port(s, sp);
        const Q = port(t, sq);
        for (const w of wegeErzeugen(z, geo, P, sp, Q, sq)) {
          const pts = vereinfachen(w.pts);
          let kosten = wegKosten(z, geo, pts, fluss.von, fluss.nach, w.korridore);
          if (!aussenSeiten.length) kosten += KOSTEN.seiteDoppelt;
          if (!innenSeiten.length) kosten += KOSTEN.seiteDoppelt;
          if (!best || kosten < best.kosten - 1e-6) best = { pts, kosten, sp, sq, belegungen: w.belegungen };
        }
      }
    }
    if (!best) {
      // Notweg, falls kein Kandidat passt: rechts heraus, links hinein
      const P = port(s, "r");
      const Q = port(t, "l");
      best = { pts: vereinfachen([P, { x: P.x + 15, y: P.y }, { x: P.x + 15, y: Q.y }, Q]), kosten: KOSTEN.form, sp: "r", sq: "l", belegungen: [] };
    }
    return best;
  };

  const einzeln = (fluss) => {
    const weg = bester(fluss, seitenAus(fluss.von), seitenEin(fluss.nach, fluss));
    festschreiben(z, fluss.id, weg, fluss.von, fluss.nach, istGw(fluss.von), istGw(fluss.nach));
    kanten.set(fluss.id, weg.pts);
    summe += weg.kosten;
  };

  const gruppe = (id, fluesse) => {
    const frei = seitenAus(id);
    if (fluesse.length > frei.length) {
      for (const fluss of fluesse) einzeln(fluss);
      return;
    }
    let beste = null;
    for (const zuordnung of permutationen(frei, fluesse.length)) {
      const m = marke(z);
      let kosten = 0;
      fluesse.forEach((fluss, i) => {
        const weg = bester(fluss, [zuordnung[i]], seitenEin(fluss.nach, fluss));
        festschreiben(z, fluss.id, weg, fluss.von, fluss.nach, true, istGw(fluss.nach));
        kosten += weg.kosten;
      });
      zurueck(z, m);
      if (!beste || kosten < beste.kosten - 1e-6) beste = { kosten, zuordnung };
    }
    fluesse.forEach((fluss, i) => {
      const weg = bester(fluss, [beste.zuordnung[i]], seitenEin(fluss.nach, fluss));
      festschreiben(z, fluss.id, weg, fluss.von, fluss.nach, true, istGw(fluss.nach));
      kanten.set(fluss.id, weg.pts);
      summe += weg.kosten;
    });
  };

  for (const id of reihenfolge) {
    const vorwaerts = aus.get(id).filter((fl) => !rueckkanten.has(fl.id));
    if (istGw(id) && vorwaerts.length >= 2) gruppe(id, vorwaerts);
    else vorwaerts.forEach(einzeln);
  }
  for (const fluss of modell.fluesse) {
    if (rueckkanten.has(fluss.id)) einzeln(fluss);
  }

  // Nachrichtenflüsse: senkrecht zum Black-Box-Pool, bei Hindernissen über die Spaltenlücke
  const versatz = new Map();
  for (const nachricht of modell.nachrichten) {
    const externId = geo.externPools.has(nachricht.von) ? nachricht.von : nachricht.nach;
    const elementId = externId === nachricht.von ? nachricht.nach : nachricht.von;
    const ext = geo.externPools.get(externId);
    const shape = geo.shapes.get(elementId);
    if (!ext || !shape) continue;
    const n = versatz.get(elementId) || 0;
    versatz.set(elementId, n + 1);
    const x = shape.x + shape.w / 2 + (n === 0 ? 0 : (n % 2 === 1 ? 14 : -14) * Math.ceil(n / 2));
    const randExtern = ext.oben ? ext.bounds.y + ext.bounds.h : ext.bounds.y;
    const randElement = ext.oben ? shape.y : shape.y + shape.h;
    const gerade = [punkt(x, randExtern), punkt(x, randElement)];
    let weg = gerade;
    let kosten = nachrichtKosten(z, geo, weg, elementId);
    if (kosten >= KOSTEN.form) {
      const yKnick = ext.oben ? shape.y - 18 : shape.y + shape.h + 18;
      for (const versuch of [COL_W / 2, -COL_W / 2]) {
        const xLuecke = shape.x + shape.w / 2 + versuch + (n % 3) * 8;
        const umweg = [punkt(xLuecke, randExtern), punkt(xLuecke, yKnick), punkt(x, yKnick), punkt(x, randElement)];
        const k = nachrichtKosten(z, geo, umweg, elementId);
        if (k < kosten) {
          weg = umweg;
          kosten = k;
        }
      }
    }
    summe += kosten;
    kanten.set(nachricht.id, externId === nachricht.von ? weg : [...weg].reverse());
  }

  // Datenassoziationen: kurze senkrechte Linie zwischen Datenobjekt und Aufgabe
  for (const ref of basis.refs) {
    const d = geo.shapes.get(ref.id);
    const beide = ref.lesen.filter((id) => ref.schreiben.includes(id));
    for (const ziel of ref.lesen) {
      const t = geo.shapes.get(ziel);
      kanten.set(`DIA_${ref.id}_${ziel}`, assoziation(d, t, beide.includes(ziel) ? -6 : 0, true));
    }
    for (const quelle of ref.schreiben) {
      const s = geo.shapes.get(quelle);
      kanten.set(`DOA_${quelle}_${ref.id}`, assoziation(d, s, beide.includes(quelle) ? 6 : 0, false));
    }
  }

  summe += geo.zeilenSumme * KOSTEN.zeile;

  // Benötigte Spuren je Korridor (für die endgültige Höhe der Bahnen)
  const spuren = geo.bahnGeo.map(() => ({ oben: 0, unten: 0 }));
  for (const [key, liste] of z.belegung) {
    if (!liste.length) continue;
    const m = key.match(/^([OU])(\d+):(\d+)$/);
    if (!m) continue;
    const eintrag = spuren[Number(m[2])];
    const feld = m[1] === "O" ? "oben" : "unten";
    eintrag[feld] = Math.max(eintrag[feld], Number(m[3]) + 1);
  }

  return { kanten, kosten: summe, spuren };
}

function nachrichtKosten(z, geo, pts, elementId) {
  let kosten = 0;
  const segs = segmente(pts);
  segs.forEach((s, i) => {
    for (const [id, box] of geo.shapes) {
      if (id === elementId && i === segs.length - 1) continue;
      if (trifftBox(s, box, 2)) kosten += KOSTEN.form;
    }
    for (const t of z.segs) {
      const art = vergleiche(s, t);
      if (art === "kreuzung") kosten += KOSTEN.kreuzung;
      else if (art === "ueberlagerung") kosten += KOSTEN.ueberlagerung;
    }
  });
  return kosten;
}

function assoziation(d, element, versatz, zumElement) {
  const x = Math.round(d.x + d.w / 2 + versatz);
  const unterhalb = d.y >= element.y + element.h;
  const randElement = unterhalb ? element.y + element.h : element.y;
  const randDaten = unterhalb ? d.y : d.y + d.h;
  const innerhalb = x > element.x + 4 && x < element.x + element.w - 4;
  const zielX = innerhalb ? x : Math.round(element.x + element.w / 2);
  const weg = [punkt(x, randDaten), punkt(zielX, randElement)];
  return zumElement ? weg : weg.reverse();
}

function* permutationen(seiten, k) {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i < seiten.length; i += 1) {
    const rest = [...seiten.slice(0, i), ...seiten.slice(i + 1)];
    for (const p of permutationen(rest, k - 1)) yield [seiten[i], ...p];
  }
}

function* reihenfolgen(liste) {
  if (liste.length <= 1) {
    yield liste;
    return;
  }
  if (liste.length > 3) {
    yield liste;
    yield [...liste].reverse();
    return;
  }
  for (const p of permutationen(liste, liste.length)) yield p;
}

// ---------------------------------------------------------------------------

function durchlauf(modell, basis, wahl, korridore) {
  const zeile = zeilenZuweisen(basis, wahl);
  const geo = geometrie(modell, basis, zeile, korridore);
  const route = routen(modell, basis, geo);
  return { zeile, geo, route };
}

export function anordnen(modell) {
  const basis = grundlagen(modell);
  const probe = basis.bahnen.map(() => ({ oben: SPUREN_PROBE, unten: SPUREN_PROBE }));

  // Reihenfolge der Ausgänge je verzweigendem Gateway wählen (Regel 17.6): Kreuzungen und Umwege vermeiden
  let wahl = verzweigungen(basis);
  let besteKosten = durchlauf(modell, basis, wahl, probe).route.kosten;
  for (const [gatewayId, reihe] of [...wahl]) {
    for (const variante of reihenfolgen(reihe)) {
      if (variante.every((id, i) => id === wahl.get(gatewayId)[i])) continue;
      const versuch = new Map(wahl).set(gatewayId, variante);
      const kosten = durchlauf(modell, basis, versuch, probe).route.kosten;
      if (kosten < besteKosten - 0.5) {
        besteKosten = kosten;
        wahl = versuch;
      }
    }
  }

  // Endgültig: Korridore nur so hoch wie nötig
  const mitProbe = durchlauf(modell, basis, wahl, probe);
  const knapp = durchlauf(modell, basis, wahl, mitProbe.route.spuren);
  const ergebnis = knapp.route.kosten <= mitProbe.route.kosten + 50 ? knapp : mitProbe;
  const { geo, route } = ergebnis;

  const lanes = basis.mitBahnen
    ? geo.bahnGeo.map((b) => ({ id: b.id, bounds: { x: POOL_X + POOL_LABEL_W, y: b.top, w: geo.poolBreite - POOL_LABEL_W, h: b.bottom - b.top } }))
    : [];

  return { pool: geo.pool, lanes, shapes: geo.shapes, externPools: geo.externPools, kanten: route.kanten, mitBahnen: basis.mitBahnen, datenRefs: basis.refs };
}
