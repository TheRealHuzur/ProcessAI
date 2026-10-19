// Alle Einstellungen an einer Stelle. Werte kommen aus Umgebungsvariablen.
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

// Anbieter mit OpenAI-kompatibler Schnittstelle (chat/completions).
// Ein Wechsel zu Mistral direkt ist nur ein weiterer Eintrag hier plus API-Schlüssel.
export const PROVIDERS = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    extraHeaders: {
      "HTTP-Referer": "https://prozesspilot.wissen-und-werkzeug.de",
      "X-Title": "ProzessPilot"
    }
  },
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    extraHeaders: {}
  },
  // Myra AI Workspace (Deutschland, BSI C5). Die Adresse enthält Mandant und Gateway:
  // https://ai.myra.eu/v1/<mandant>/<gateway>/compat
  myra: {
    baseUrl: basisAdresse(process.env.MYRA_BASE_URL),
    apiKeyEnv: "MYRA_API_KEY",
    extraHeaders: {}
  }
};

// Bekannte Myra-Modelle. Die EU-Flotte läuft bei Myra selbst, Claude wird über Myra an Anthropic weitergeleitet.
const MYRA_KATALOG = {
  "qwen3.8-27b": "Qwen 3.8 27B (Myra, EU-Flotte)",
  "mistral-small-4": "Mistral Small 4 (Myra, EU-Flotte)",
  "gemma-4-31b-it": "Gemma 4 31B (Myra, EU-Flotte)",
  "claude-haiku-4-5": "Claude Haiku 4.5 (über Myra)",
  "claude-sonnet-5": "Claude Sonnet 5 (über Myra)"
};
const MYRA_STANDARD = ["qwen3.8-27b", "mistral-small-4", "gemma-4-31b-it"];

// MYRA_MODELLE: kommagetrennte Modell-IDs, die am Myra-Gateway freigeschaltet sind. Ohne Angabe die EU-Flotte.
function myraModelle() {
  const ids = String(process.env.MYRA_MODELLE || "").split(",").map((id) => id.trim()).filter(Boolean);
  return (ids.length ? ids : MYRA_STANDARD).map((id) => ({ id: `myra/${id}`, apiModel: id, label: MYRA_KATALOG[id] || `${id} (Myra)`, provider: "myra" }));
}

// Akzeptiert die Basisadresse auch mit angehängtem /chat/completions oder Schrägstrich
function basisAdresse(wert) {
  return String(wert || "").trim().replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
}

// Modelle für das Auswahlfeld. Überschreibbar per MODELS_JSON (gleiche Struktur).
const DEFAULT_MODELS = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash (sehr günstig)", provider: "openrouter" },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small 4", provider: "openrouter" },
  // Direkt bei Mistral (EU). Erscheint nur, wenn MISTRAL_API_KEY gesetzt ist.
  { id: "mistral/mistral-small-latest", apiModel: "mistral-small-latest", label: "Mistral Small (direkt bei Mistral, EU)", provider: "mistral" },
  // Myra: erscheinen nur mit MYRA_API_KEY und MYRA_BASE_URL, Auswahl über MYRA_MODELLE
  ...myraModelle()
];

function readModels() {
  if (!process.env.MODELS_JSON) {
    return DEFAULT_MODELS;
  }
  try {
    const parsed = JSON.parse(process.env.MODELS_JSON);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    console.error("MODELS_JSON ist kein gültiges JSON, Standardmodelle werden verwendet.", error.message);
  }
  return DEFAULT_MODELS;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || path.join(ROOT_DIR, "data"),
  appPassword: process.env.APP_PASSWORD || "",
  // Ohne SESSION_SECRET wird bei jedem Neustart ein neues erzeugt (dann neu anmelden).
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  sessionDays: 30,
  models: readModels(),
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS || 180000),
  maxTextLength: 30000,
  // Zugang für Claude Desktop über MCP (/api/mcp). Ohne Token ist die Schnittstelle abgeschaltet.
  mcpToken: String(process.env.MCP_TOKEN || "").trim(),
  // Spracherkennung auf dem eigenen Server (Whisper, OpenAI-kompatibel). Ohne Adresse nutzt die App die des Browsers.
  whisper: {
    baseUrl: basisAdresse(process.env.WHISPER_BASE_URL).replace(/\/v1$/, ""),
    // Ohne Angabe nimmt der Dienst sein voreingestelltes Modell
    model: String(process.env.WHISPER_MODEL || "").trim(),
    language: "de",
    // Fachwörter als Hilfe: ohne Vorgabe wurde im Test aus Sachbearbeitung "Nachbearbeitung", aus Kämmerei "Kämmerheit"
    prompt: String(process.env.WHISPER_PROMPT || "Prozessbeschreibung aus der Verwaltung mit Sachbearbeitung, Poststelle, Kämmerei, Antrag und Bescheid.").trim(),
    timeoutMs: Number(process.env.WHISPER_TIMEOUT_MS || 120000)
  }
};

// Nur Modelle, für deren Anbieter ein API-Schlüssel und eine Adresse hinterlegt sind
export function verfuegbareModelle() {
  return config.models.filter((model) => {
    const provider = PROVIDERS[model.provider];
    return provider && Boolean(provider.baseUrl) && Boolean(process.env[provider.apiKeyEnv]);
  });
}

export function findModel(modelId) {
  return verfuegbareModelle().find((model) => model.id === modelId) || null;
}
