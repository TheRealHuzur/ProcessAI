// Passwörter nur als scrypt-Hash speichern (node:crypto, keine weitere Abhängigkeit).
import crypto from "node:crypto";

const LAENGE = 64;

export function hashePasswort(passwort) {
  const salz = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(String(passwort), salz, LAENGE).toString("base64url");
  return `scrypt$${salz}$${hash}`;
}

export function passwortPasst(passwort, gespeichert) {
  const [art, salz, hash] = String(gespeichert || "").split("$");
  if (art !== "scrypt" || !salz || !hash) return false;
  const erwartet = Buffer.from(hash, "base64url");
  const ist = crypto.scryptSync(String(passwort), salz, erwartet.length);
  return erwartet.length === ist.length && crypto.timingSafeEqual(erwartet, ist);
}

// Vergleich zweier Texte in gleicher Zeit, egal wo sie sich unterscheiden
export function gleich(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
