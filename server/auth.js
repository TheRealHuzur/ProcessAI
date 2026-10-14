// Einfacher Zugangsschutz mit einem Passwort (APP_PASSWORD) und signiertem Cookie.
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

export function istAngemeldet(req) {
  const wert = leseCookie(req, COOKIE);
  const [ablauf, signatur] = wert.split(".");
  if (!ablauf || !signatur) return false;
  if (!gleich(signatur, signiere(ablauf))) return false;
  return Number(ablauf) > Date.now();
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
  if (!gleich(passwort, config.appPassword)) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return res.status(401).json({ fehler: "Passwort stimmt nicht." });
  }
  const ablauf = String(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  setzeCookie(req, res, `${ablauf}.${signiere(ablauf)}`, config.sessionDays * 24 * 60 * 60);
  return res.json({ ok: true });
}

export function abmelden(req, res) {
  setzeCookie(req, res, "", 0);
  res.json({ ok: true });
}

export function nurAngemeldet(req, res, next) {
  if (!config.appPassword) {
    return res.status(503).json({ fehler: "Auf dem Server ist kein Passwort hinterlegt (APP_PASSWORD)." });
  }
  if (!istAngemeldet(req)) {
    return res.status(401).json({ fehler: "Bitte anmelden." });
  }
  return next();
}
