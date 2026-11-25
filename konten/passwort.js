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

// Lesbare Kopie des Passworts für die Verwaltung (Patrick, 25.11.2026): AES-256-GCM mit einem Schlüssel aus
// SESSION_SECRET. Die Anmeldung prüft weiter nur den Hash. Ändert sich das Geheimnis, ist die Kopie nicht mehr lesbar.
const schluesselAus = (geheimnis) => crypto.createHash("sha256").update(`portal-passwort:${geheimnis}`).digest();

export function verschluessele(text, geheimnis) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", schluesselAus(geheimnis), iv);
  const inhalt = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), inhalt.toString("base64url")].join("$");
}

// Klartext oder null, wenn nichts gespeichert ist oder der Schlüssel nicht passt
export function entschluessele(gespeichert, geheimnis) {
  const [art, iv, tag, inhalt] = String(gespeichert || "").split("$");
  if (art !== "v1" || !iv || !tag || inhalt === undefined) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", schluesselAus(geheimnis), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(inhalt, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// Vergleich zweier Texte in gleicher Zeit, egal wo sie sich unterscheiden
export function gleich(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
