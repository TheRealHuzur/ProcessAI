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
  }
};

// Modelle für das Auswahlfeld. Überschreibbar per MODELS_JSON (gleiche Struktur).
const DEFAULT_MODELS = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash (sehr günstig)", provider: "openrouter" },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small 4", provider: "openrouter" }
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
  maxTextLength: 30000
};

export function findModel(modelId) {
  return config.models.find((model) => model.id === modelId) || null;
}
