// Kundenportal: Anmeldung je Mandant, Verwaltung für Patrick, freigeschaltete Module.
// Läuft als eigener Container ohne KI (Dockerfile.portal). Module stehen in portal/module/.
import path from "node:path";
import express from "express";
import { kontokern, sitzungsCookie, gleich, KontenFehler, LIZENZEN } from "../konten/index.js";
import { leseKonfiguration, ROOT_DIR } from "./config.js";
import { oeffnePortalDatenbank } from "./db.js";
import { MODULE, pruefeModule } from "./module/index.js";

const OBERFLAECHE = path.join(ROOT_DIR, "portal", "oberflaeche");
// Gemeinsame Stilvorlage (Styleguide, Schriften, Logo, Icons), auch ohne Anmeldung für die Anmeldeseite
const STIL = path.join(ROOT_DIR, "kern", "stil");
const warte = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function erstellePortal({ db, config, module = MODULE }) {
  pruefeModule(module);
  const kern = kontokern(db);
  const mandantSitzung = sitzungsCookie({ name: "portal_sitzung", geheimnis: config.sessionSecret, tage: config.sitzungTage });
  const adminSitzung = sitzungsCookie({ name: "portal_verwaltung", geheimnis: config.sessionSecret, tage: 1 });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });

  const angemeldet = (req) => {
    const id = mandantSitzung.lesen(req);
    return id ? kern.aktiverMandant(id) : null;
  };
  const istAdmin = (req) => Boolean(config.adminPasswort) && adminSitzung.lesen(req) === "admin";
  const freigeschaltet = (mandant) => module
    .filter((m) => mandant.module.some((x) => x.modul_id === m.id))
    .map((m) => ({ id: m.id, name: m.name, beschreibung: m.beschreibung, icon: m.icon || "", knopf: m.knopf || "Öffnen", adresse: `/m/${m.id}/` }));
  const fehler = (res, error, was) => {
    if (error instanceof KontenFehler) return res.status(error.status).json({ fehler: error.message });
    console.error(`${was} fehlgeschlagen:`, error);
    return res.status(500).json({ fehler: `Unerwarteter Fehler: ${was}.` });
  };

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/stil", express.static(STIL, { maxAge: "1h", fallthrough: false }));

  // ---------- Mandanten ----------
  const json = express.json({ limit: "100kb" });

  app.get("/api/sitzung", (req, res) => {
    const mandant = angemeldet(req);
    res.json(mandant ? { angemeldet: true, mandant: { name: mandant.name }, module: freigeschaltet(mandant) } : { angemeldet: false });
  });

  app.post("/api/anmelden", json, async (req, res) => {
    const { benutzername, passwort } = req.body || {};
    const mandant = kern.pruefeZugang(benutzername, passwort);
    if (!mandant) {
      kern.protokolliere({ aktion: "anmelden", ergebnis: "fehler", details: String(benutzername || "").slice(0, 120) });
      await warte(1000);
      return res.status(401).json({ fehler: "Benutzername oder Passwort stimmt nicht." });
    }
    mandantSitzung.setzen(req, res, mandant.id);
    kern.protokolliere({ mandantId: mandant.id, aktion: "anmelden" });
    return res.json({ ok: true, mandant: { name: mandant.name }, module: freigeschaltet(mandant) });
  });

  app.post("/api/abmelden", (req, res) => {
    mandantSitzung.loeschen(req, res);
    res.json({ ok: true });
  });

  // Module: Schnittstelle unter /api/m/<id>, Seite unter /m/<id>/, nur angemeldet und freigeschaltet
  for (const modul of module) {
    const zugang = (req, res, next) => {
      const mandant = angemeldet(req);
      if (!mandant) return res.status(401).json({ fehler: "Bitte anmelden." });
      if (!kern.hatModul(mandant.id, modul.id)) return res.status(403).json({ fehler: "Dieses Modul ist für Ihren Zugang nicht freigeschaltet." });
      req.mandant = mandant;
      return next();
    };
    const seite = (req, res, next) => {
      const mandant = angemeldet(req);
      if (!mandant || !kern.hatModul(mandant.id, modul.id)) return res.redirect(302, "/");
      return next();
    };
    const datenDir = path.join(config.dataDir, "module", modul.id);
    app.use(`/api/m/${modul.id}`, zugang, modul.router({ db, kern, datenDir }));
    app.use(`/m/${modul.id}`, seite, express.static(modul.oberflaeche, { index: "index.html", maxAge: 0 }));
  }

  // ---------- Verwaltung (Patrick) ----------
  app.get("/api/verwaltung/sitzung", (req, res) => {
    res.json({ angemeldet: istAdmin(req), eingerichtet: Boolean(config.adminPasswort) });
  });

  app.post("/api/verwaltung/anmelden", json, async (req, res) => {
    if (!config.adminPasswort) return res.status(503).json({ fehler: "Auf dem Server ist kein Passwort für die Verwaltung hinterlegt (PORTAL_ADMIN_PASSWORT)." });
    if (!gleich(String(req.body?.passwort || ""), config.adminPasswort)) {
      await warte(1000);
      return res.status(401).json({ fehler: "Passwort stimmt nicht." });
    }
    adminSitzung.setzen(req, res, "admin");
    return res.json({ ok: true });
  });

  app.post("/api/verwaltung/abmelden", (req, res) => {
    adminSitzung.loeschen(req, res);
    res.json({ ok: true });
  });

  const verwaltung = express.Router();
  verwaltung.use((req, res, next) => (istAdmin(req) ? next() : res.status(401).json({ fehler: "Bitte als Verwaltung anmelden." })));
  verwaltung.use(json);

  verwaltung.get("/module", (req, res) => {
    res.json({ module: module.map((m) => ({ id: m.id, name: m.name, beschreibung: m.beschreibung })), lizenzen: LIZENZEN });
  });
  verwaltung.get("/mandanten", (req, res) => res.json({ mandanten: kern.liste() }));
  verwaltung.post("/mandanten", (req, res) => {
    try {
      const mandant = kern.anlegen(req.body || {});
      kern.protokolliere({ mandantId: mandant.id, aktion: "verwaltung: angelegt", details: mandant.benutzername });
      return res.status(201).json({ mandant });
    } catch (error) {
      return fehler(res, error, "Mandant anlegen");
    }
  });
  verwaltung.patch("/mandanten/:id", (req, res) => {
    try {
      const { name, benutzername, passwort, aktiv } = req.body || {};
      const mandant = kern.aendern(req.params.id, { name, benutzername, passwort, aktiv });
      const was = [name !== undefined && "Name", benutzername !== undefined && "Benutzername", passwort && "Passwort", aktiv !== undefined && (aktiv ? "entsperrt" : "gesperrt")].filter(Boolean);
      kern.protokolliere({ mandantId: mandant.id, aktion: "verwaltung: geaendert", details: was.join(", ") });
      return res.json({ mandant });
    } catch (error) {
      return fehler(res, error, "Mandant ändern");
    }
  });
  verwaltung.put("/mandanten/:id/module/:modul", (req, res) => {
    try {
      if (!module.some((m) => m.id === req.params.modul)) throw new KontenFehler("Unbekanntes Modul.", 404);
      const an = Boolean(req.body?.an);
      const mandant = kern.modulSetzen(req.params.id, req.params.modul, { an, lizenz: req.body?.lizenz || "test" });
      kern.protokolliere({ mandantId: mandant.id, modulId: req.params.modul, aktion: `verwaltung: ${an ? "freigeschaltet" : "gesperrt"}`, details: an ? req.body?.lizenz || "test" : "" });
      return res.json({ mandant });
    } catch (error) {
      return fehler(res, error, "Modul setzen");
    }
  });
  verwaltung.get("/protokoll", (req, res) => {
    res.json({ eintraege: kern.protokoll({ mandantId: req.query.mandant ? String(req.query.mandant) : null, anzahl: 200 }) });
  });
  app.use("/api/verwaltung", verwaltung);

  app.use("/api", (req, res) => res.status(404).json({ fehler: "Unbekannte Schnittstelle." }));
  app.use(express.static(OBERFLAECHE, { index: "index.html", maxAge: 0 }));
  app.use((req, res) => res.status(404).sendFile(path.join(OBERFLAECHE, "index.html")));
  return app;
}

const istHauptmodul = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT_DIR, "portal", "server.js");

if (istHauptmodul) {
  const config = leseKonfiguration();
  if (!config.adminPasswort) console.warn("WARNUNG: PORTAL_ADMIN_PASSWORT ist nicht gesetzt. Die Verwaltung ist gesperrt.");
  if (!process.env.SESSION_SECRET) console.warn("WARNUNG: SESSION_SECRET ist nicht gesetzt. Nach jedem Neustart muss man sich neu anmelden.");
  const db = oeffnePortalDatenbank(config.dataDir, MODULE);
  erstellePortal({ db, config }).listen(config.port, () => {
    console.log(`Kundenportal läuft auf Port ${config.port}, Daten in ${config.dataDir}, Module: ${MODULE.map((m) => m.id).join(", ")}`);
  });
}
