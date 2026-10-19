// ProzessPilot: Webserver und Schnittstelle
import path from "node:path";
import express from "express";
import { config, findModel, verfuegbareModelle, findChatModel, verfuegbareChatModelle, ROOT_DIR } from "./config.js";
import { oeffneDatenbank } from "./db.js";
import { anmelden, abmelden, angemeldetesKonto, nurAngemeldet } from "./auth.js";
import { erzeugeModell, aendereModell } from "./pipeline.js";
import { LlmError } from "./llm.js";
import { erzeugeHandbuch, HandbuchFehler } from "./handbuch.js";
import { verschrifte, SpracheFehler } from "./sprache.js";
import { mcpRouter } from "./mcp.js";
import { beantworteFrage, ChatFehler, MAX_FRAGE } from "./chat.js";
import { neuerKommentar, entscheide, KommentarFehler } from "./kommentare.js";

export function erstelleApp({ db, llm, sprache = verschrifte } = {}) {
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
    const konto = config.appPassword ? angemeldetesKonto(req) : null;
    res.json({
      angemeldet: Boolean(konto),
      konto: konto ? konto.name : null,
      passwortGesetzt: Boolean(config.appPassword),
      spracheServer: Boolean(config.whisper.baseUrl)
    });
  });
  app.post("/api/anmelden", anmelden);
  app.post("/api/abmelden", abmelden);

  // Claude Desktop über MCP, eigener Zugang per MCP_TOKEN statt Passwort
  app.use("/api/mcp", mcpRouter({ db, llm }));

  app.use("/api", nurAngemeldet);

  app.get("/api/modelle", (req, res) => {
    const modelle = verfuegbareModelle();
    res.json((modelle.length ? modelle : config.models).map(({ id, label }) => ({ id, label })));
  });

  app.post("/api/erzeugen", async (req, res) => {
    const text = String(req.body?.text || "").trim();
    const prozessname = String(req.body?.prozessname || "").trim();
    const model = findModel(String(req.body?.modell || "")) || verfuegbareModelle()[0] || config.models[0];

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

  app.post("/api/aendern", async (req, res) => {
    const body = req.body || {};
    const anweisung = String(body.anweisung || "").trim();
    const modellJson = body.prozess;
    const bezug = {
      elementId: String(body.bezug?.elementId || "").trim(),
      elementName: String(body.bezug?.elementName || "").trim(),
      frage: String(body.bezug?.frage || "").trim()
    };
    const model = findModel(String(body.modell || "")) || verfuegbareModelle()[0] || config.models[0];

    if (anweisung.length < 3) {
      return res.status(400).json({ fehler: "Bitte sag oder schreib, was sich ändern soll." });
    }
    if (anweisung.length > 2000) {
      return res.status(400).json({ fehler: "Die Anweisung ist zu lang (höchstens 2000 Zeichen)." });
    }
    if (!modellJson || typeof modellJson !== "object" || !Array.isArray(modellJson.elemente) || modellJson.elemente.length === 0) {
      return res.status(400).json({ fehler: "Es gibt noch kein Modell, das geändert werden kann." });
    }

    const beginn = Date.now();
    try {
      const ergebnis = await aendereModell({ modellJson, anweisung, bezug, model, ...(llm ? { llm } : {}) });
      return res.json({ ...ergebnis, modell: model.id, dauerMs: Date.now() - beginn });
    } catch (error) {
      console.error("Modelländerung fehlgeschlagen:", error);
      const status = error instanceof LlmError ? 502 : 500;
      return res.status(status).json({ fehler: error instanceof LlmError ? error.message : "Unerwarteter Fehler bei der Änderung." });
    }
  });

  // Ein Audioabschnitt aus dem Browser wird zu Text. Das Audio wird nicht gespeichert.
  app.post("/api/sprache", express.raw({ type: ["audio/*", "video/webm", "application/octet-stream"], limit: "10mb" }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ fehler: "Es ist keine Aufnahme angekommen." });
    }
    try {
      const text = await sprache(req.body, { mimeType: req.get("content-type"), vorher: vorherigerText(req.get("x-vorher")) });
      return res.json({ text });
    } catch (error) {
      if (error instanceof SpracheFehler) return res.status(error.status).json({ fehler: error.message });
      console.error("Spracherkennung fehlgeschlagen:", error);
      return res.status(500).json({ fehler: "Unerwarteter Fehler bei der Spracherkennung." });
    }
  });

  // Handbuch als PDF aus dem aktuellen Modell im Editor (auch ungespeichert)
  app.post("/api/handbuch", async (req, res) => {
    const body = req.body || {};
    const bpmnXml = String(body.bpmnXml || "");
    const version = Number.isInteger(body.version) && body.version > 0 ? body.version : null;
    if (!bpmnXml.includes("definitions")) {
      return res.status(400).json({ fehler: "Kein gültiges BPMN-XML übergeben." });
    }
    try {
      const pdf = await erzeugeHandbuch(bpmnXml, { name: String(body.name || "").slice(0, 200), version });
      return res.type("application/pdf").send(Buffer.from(pdf));
    } catch (error) {
      if (error instanceof HandbuchFehler) return res.status(400).json({ fehler: error.message });
      console.error("Handbuch fehlgeschlagen:", error);
      return res.status(500).json({ fehler: "Unerwarteter Fehler beim Erstellen des Handbuchs." });
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

  // Kommentare und Ergänzungsvorschläge am Schritt
  app.get("/api/prozesse/:id/kommentare", (req, res) => {
    if (!db.holeProzess(req.params.id)) return res.status(404).json({ fehler: "Prozess nicht gefunden." });
    return res.json(db.listeKommentare(req.params.id));
  });

  app.post("/api/prozesse/:id/kommentare", async (req, res) => {
    const body = req.body || {};
    try {
      const kommentar = await neuerKommentar(db, req.params.id, {
        elementId: String(body.elementId || "").trim(),
        art: String(body.art || "").trim(),
        text: String(body.text || "").trim(),
        konto: req.konto.name
      });
      return res.json(kommentar);
    } catch (error) {
      return kommentarFehler(res, error);
    }
  });

  // Offene Einträge aller Prozesse für die Vorschlagsliste
  app.get("/api/kommentare/offen", (req, res) => {
    res.json(db.offeneKommentare());
  });

  app.post("/api/kommentare/:id/entscheiden", async (req, res) => {
    const body = req.body || {};
    try {
      const ergebnis = await entscheide(db, req.params.id, {
        aktion: String(body.aktion || ""),
        text: String(body.text || "").trim(),
        konto: req.konto.name
      });
      return res.json(ergebnis);
    } catch (error) {
      return kommentarFehler(res, error);
    }
  });

  // Chatbot: antwortet nur aus dem Wissen der neuesten Version eines Prozesses
  app.get("/api/chat/modelle", (req, res) => {
    const modelle = verfuegbareChatModelle();
    res.json((modelle.length ? modelle : config.chatModels).map(({ id, label }) => ({ id, label })));
  });

  app.post("/api/chat", async (req, res) => {
    const body = req.body || {};
    const frage = String(body.frage || "").trim();
    if (frage.length < 2) return res.status(400).json({ fehler: "Bitte eine Frage eingeben." });
    if (frage.length > MAX_FRAGE) return res.status(400).json({ fehler: `Die Frage ist zu lang (höchstens ${MAX_FRAGE} Zeichen).` });
    const prozess = db.holeProzess(String(body.prozessId || ""));
    if (!prozess) return res.status(404).json({ fehler: "Bitte links einen Prozess auswählen." });
    const model = findChatModel(String(body.modell || "")) || verfuegbareChatModelle()[0] || config.chatModels[0];
    const beginn = Date.now();
    try {
      const ergebnis = await beantworteFrage({ prozess, frage, verlauf: body.verlauf, model, ...(llm ? { llm } : {}) });
      return res.json({ ...ergebnis, modell: model.id, dauerMs: Date.now() - beginn });
    } catch (error) {
      if (error instanceof ChatFehler) return res.status(error.status).json({ fehler: error.message });
      console.error("Chat fehlgeschlagen:", error);
      const status = error instanceof LlmError ? 502 : 500;
      return res.status(status).json({ fehler: error instanceof LlmError ? error.message : "Unerwarteter Fehler beim Chat." });
    }
  });

  app.use("/api", (req, res) => res.status(404).json({ fehler: "Unbekannte Schnittstelle." }));

  // Eigene Oberfläche für den Chatbot, schon die Seite nur nach Anmeldung
  app.use("/chat", (req, res, next) => {
    if (config.appPassword && angemeldetesKonto(req)) return next();
    return res.redirect(302, "/?weiter=chat");
  }, express.static(path.join(ROOT_DIR, "public", "chat"), { index: "index.html", maxAge: "1h" }));

  app.use(express.static(path.join(ROOT_DIR, "public"), { index: "index.html", maxAge: "1h" }));
  app.use((req, res) => res.status(404).sendFile(path.join(ROOT_DIR, "public", "index.html")));

  return app;
}

function kommentarFehler(res, error) {
  if (error instanceof KommentarFehler) return res.status(error.status).json({ fehler: error.message });
  console.error("Kommentar fehlgeschlagen:", error);
  return res.status(500).json({ fehler: "Unerwarteter Fehler bei Kommentaren." });
}

// Der Browser schickt das Ende des vorigen Abschnitts URL-kodiert mit (Kopfzeilen vertragen keine Sonderzeichen)
function vorherigerText(wert) {
  try {
    return decodeURIComponent(String(wert || "")).slice(-300);
  } catch {
    return "";
  }
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
