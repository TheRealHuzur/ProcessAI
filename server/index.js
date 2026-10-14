// ProzessPilot: Webserver und Schnittstelle
import path from "node:path";
import express from "express";
import { config, findModel, ROOT_DIR } from "./config.js";
import { oeffneDatenbank } from "./db.js";
import { anmelden, abmelden, istAngemeldet, nurAngemeldet } from "./auth.js";
import { erzeugeModell } from "./pipeline.js";
import { LlmError } from "./llm.js";

export function erstelleApp({ db, llm } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(express.json({ limit: "5mb" }));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.get("/api/sitzung", (req, res) => {
    res.json({ angemeldet: Boolean(config.appPassword) && istAngemeldet(req), passwortGesetzt: Boolean(config.appPassword) });
  });
  app.post("/api/anmelden", anmelden);
  app.post("/api/abmelden", abmelden);

  app.use("/api", nurAngemeldet);

  app.get("/api/modelle", (req, res) => {
    res.json(config.models.map(({ id, label }) => ({ id, label })));
  });

  app.post("/api/erzeugen", async (req, res) => {
    const text = String(req.body?.text || "").trim();
    const prozessname = String(req.body?.prozessname || "").trim();
    const model = findModel(String(req.body?.modell || "")) || config.models[0];

    if (text.length < 20) {
      return res.status(400).json({ fehler: "Die Prozessbeschreibung ist zu kurz." });
    }
    if (text.length > config.maxTextLength) {
      return res.status(400).json({ fehler: `Die Prozessbeschreibung ist zu lang (höchstens ${config.maxTextLength} Zeichen).` });
    }

    const beginn = Date.now();
    try {
      const ergebnis = await erzeugeModell({ text, prozessname, model, ...(llm ? { llm } : {}) });
      return res.json({ ...ergebnis, modell: model.id, dauerMs: Date.now() - beginn });
    } catch (error) {
      console.error("Modellerzeugung fehlgeschlagen:", error);
      const status = error instanceof LlmError ? 502 : 500;
      return res.status(status).json({ fehler: error instanceof LlmError ? error.message : "Unerwarteter Fehler bei der Modellerzeugung." });
    }
  });

  app.get("/api/prozesse", (req, res) => {
    res.json(db.listeProzesse());
  });

  app.get("/api/prozesse/:id", (req, res) => {
    const prozess = db.holeProzess(req.params.id);
    if (!prozess) return res.status(404).json({ fehler: "Prozess nicht gefunden." });
    return res.json(prozess);
  });

  app.post("/api/prozesse", (req, res) => {
    const body = req.body || {};
    const bpmnXml = String(body.bpmnXml || "");
    if (!bpmnXml.includes("bpmn:definitions") && !bpmnXml.includes("definitions")) {
      return res.status(400).json({ fehler: "Kein gültiges BPMN-XML übergeben." });
    }
    const gespeichert = db.speichereVersion({
      prozessId: body.prozessId ? String(body.prozessId) : null,
      name: String(body.name || "").trim() || "Neuer Prozess",
      bpmnXml,
      quelltext: String(body.quelltext || ""),
      kiModell: String(body.kiModell || ""),
      kiJson: body.kiJson ? JSON.stringify(body.kiJson) : "",
      pruefungJson: body.pruefung ? JSON.stringify(body.pruefung) : "",
      notiz: String(body.notiz || "")
    });
    res.json(gespeichert);
  });

  app.delete("/api/prozesse/:id", (req, res) => {
    const ok = db.loescheProzess(req.params.id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  app.use("/api", (req, res) => res.status(404).json({ fehler: "Unbekannte Schnittstelle." }));

  app.use(express.static(path.join(ROOT_DIR, "public"), { index: "index.html", maxAge: "1h" }));
  app.use((req, res) => res.status(404).sendFile(path.join(ROOT_DIR, "public", "index.html")));

  return app;
}

const istHauptmodul = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT_DIR, "server", "index.js");

if (istHauptmodul) {
  if (!config.appPassword) {
    console.warn("WARNUNG: APP_PASSWORD ist nicht gesetzt. Anmelden ist nicht möglich.");
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn("WARNUNG: OPENROUTER_API_KEY ist nicht gesetzt. Modelle können nicht erzeugt werden.");
  }
  const db = oeffneDatenbank(config.dataDir);
  const app = erstelleApp({ db });
  app.listen(config.port, () => {
    console.log(`ProzessPilot läuft auf Port ${config.port}, Daten in ${config.dataDir}`);
  });
}
