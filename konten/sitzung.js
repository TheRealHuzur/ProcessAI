// Sitzung als signiertes Cookie: <wert>.<ablauf>.<signatur>. Kein Speicher auf dem Server.
import crypto from "node:crypto";
import { gleich } from "./passwort.js";

function leseCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const teil of header.split(";")) {
    const [k, ...v] = teil.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

// name: Cookie-Name, geheimnis: Schlüssel für die Signatur, tage: Gültigkeit
export function sitzungsCookie({ name, geheimnis, tage }) {
  const signiere = (text) => crypto.createHmac("sha256", geheimnis).update(`${name}.${text}`).digest("base64url");

  function setze(req, res, inhalt, maxAgeSek) {
    const sicher = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.append("Set-Cookie", `${name}=${encodeURIComponent(inhalt)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSek}${sicher ? "; Secure" : ""}`);
  }

  return {
    // wert darf keinen Punkt enthalten (IDs sind uuids)
    setzen(req, res, wert) {
      const ablauf = String(Date.now() + tage * 24 * 60 * 60 * 1000);
      setze(req, res, `${wert}.${ablauf}.${signiere(`${wert}.${ablauf}`)}`, tage * 24 * 60 * 60);
    },
    loeschen(req, res) {
      setze(req, res, "", 0);
    },
    // Gespeicherter Wert oder null, wenn das Cookie fehlt, falsch signiert oder abgelaufen ist
    lesen(req) {
      const [wert, ablauf, signatur] = leseCookie(req, name).split(".");
      if (!wert || !ablauf || !signatur) return null;
      if (!gleich(signatur, signiere(`${wert}.${ablauf}`))) return null;
      if (!(Number(ablauf) > Date.now())) return null;
      return wert;
    }
  };
}
