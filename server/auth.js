// Einfacher Zugangsschutz mit Passwort und signiertem Cookie. Das Passwort bestimmt das Konto
// (APP_PASSWORD Hauptkonto, KONTO2_PASSWORT zweites Konto); das Cookie trägt das Konto mit.
import crypto from "node:crypto";
import { config } from "./config.js";

const COOKIE = "pp_sitzung";

function signiere(wert) {
  return crypto.createHmac("sha256", config.sessionSecret).update(wert).digest("base64url");
}

function gleich(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function leseCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const teil of header.split(";")) {
    const [k, ...v] = teil.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function aktiveKonten() {
  return config.konten.filter((k) => k.passwort);
}

// Angemeldetes Konto als { id, name } oder null
export function angemeldetesKonto(req) {
  const teile = leseCookie(req, COOKIE).split(".");
  // Cookies von vor den Konten (ablauf.signatur) gehören zum Hauptkonto
  const [kontoId, ablauf, signatur] = teile.length === 2 ? ["konto1", teile[0], teile[1]] : teile;
  if (!kontoId || !ablauf || !signatur) return null;
  const signiert = teile.length === 2 ? ablauf : `${kontoId}.${ablauf}`;
  if (!gleich(signatur, signiere(signiert))) return null;
  if (!(Number(ablauf) > Date.now())) return null;
  const konto = aktiveKonten().find((k) => k.id === kontoId);
  return konto ? { id: konto.id, name: konto.name } : null;
}

export function istAngemeldet(req) {
  return Boolean(angemeldetesKonto(req));
}

function setzeCookie(req, res, wert, maxAgeSek) {
  const sicher = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(wert)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSek}${sicher ? "; Secure" : ""}`);
}

export async function anmelden(req, res) {
  if (!config.appPassword) {
    return res.status(503).json({ fehler: "Auf dem Server ist kein Passwort hinterlegt (APP_PASSWORD)." });
  }
  const passwort = String(req.body?.passwort || "");
  // Alle Konten prüfen, damit die Antwortzeit nicht verrät, welches passt
  const treffer = aktiveKonten().map((k) => (gleich(passwort, k.passwort) ? k : null));
  const konto = treffer.find(Boolean);
  if (!konto) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return res.status(401).json({ fehler: "Passwort stimmt nicht." });
  }
  const ablauf = String(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  setzeCookie(req, res, `${konto.id}.${ablauf}.${signiere(`${konto.id}.${ablauf}`)}`, config.sessionDays * 24 * 60 * 60);
  return res.json({ ok: true, konto: konto.name });
}

export function abmelden(req, res) {
  setzeCookie(req, res, "", 0);
  res.json({ ok: true });
}

export function nurAngemeldet(req, res, next) {
  if (!config.appPassword) {
    return res.status(503).json({ fehler: "Auf dem Server ist kein Passwort hinterlegt (APP_PASSWORD)." });
  }
  const konto = angemeldetesKonto(req);
  if (!konto) {
    return res.status(401).json({ fehler: "Bitte anmelden." });
  }
  req.konto = konto;
  return next();
}
