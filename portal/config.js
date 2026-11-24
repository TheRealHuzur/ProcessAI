// Einstellungen des Kundenportals, nur aus Umgebungsvariablen. Keine KI, keine KI-Schlüssel.
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function leseKonfiguration(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    dataDir: env.DATA_DIR || path.join(ROOT_DIR, "data-portal"),
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    // Zugang zur Verwaltung (Patrick); ohne Wert ist die Verwaltung gesperrt
    adminPasswort: env.PORTAL_ADMIN_PASSWORT || "",
    sitzungTage: Number(env.SESSION_DAYS || 30)
  };
}
