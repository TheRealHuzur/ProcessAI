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
  // Myra, Modelle auf Myras eigener Infrastruktur in der EU. Erscheinen nur mit MYRA_API_KEY und MYRA_BASE_URL.
  { id: "myra/qwen3.8-27b", apiModel: "qwen3.8-27b", label: "Qwen 3.8 27B (Myra, EU)", provider: "myra" },
  { id: "myra/mistral-small-4", apiModel: "mistral-small-4", label: "Mistral Small 4 (Myra, EU)", provider: "myra" },
  { id: "myra/gemma-4-31b-it", apiModel: "gemma-4-31b-it", label: "Gemma 4 31B (Myra, EU)", provider: "myra" }
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
