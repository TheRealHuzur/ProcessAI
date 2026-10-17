// Anbindung an OpenAI-kompatible Chat-Schnittstellen (OpenRouter, Mistral, Myra).
import { PROVIDERS, config } from "./config.js";

export class LlmError extends Error {}

const WIEDERHOLBAR = new Set([408, 429, 500, 502, 503, 504]);
const WARTEZEITEN_MS = [3000, 8000];

function warte(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Verständliche Meldung statt rohem JSON der Schnittstelle
function fehlertext(status, bodyText, model) {
  if (status === 429) {
    return `${model.label || model.id} ist beim Anbieter gerade ausgelastet. Bitte in ein bis zwei Minuten erneut versuchen oder ein anderes Modell wählen.`;
  }
  if (status === 403) {
    // Myra meldet mit 403 auch Regeln des Gateways (Modell gesperrt, Datenresidenz, IP-Freigabe)
    let fehler = null;
    try {
      fehler = JSON.parse(bodyText)?.error || null;
    } catch {
      fehler = null;
    }
    if (fehler?.code && fehler.code !== "forbidden" && fehler.code !== "unauthorized") {
      return `Der KI-Anbieter lehnt die Anfrage ab (${fehler.code})${fehler.message ? `: ${fehler.message}` : ""}.`;
    }
  }
  if (status === 401 || status === 403) {
    return "Der API-Schlüssel wurde abgelehnt. Bitte in Coolify prüfen.";
  }
  if (status === 402) {
    return "Beim KI-Anbieter ist kein Guthaben mehr vorhanden.";
  }
  if (status >= 500) {
    return `Der KI-Anbieter hat gerade eine Störung (${status}). Bitte später erneut versuchen.`;
  }
  let detail = "";
  try {
    detail = JSON.parse(bodyText)?.error?.message || "";
  } catch {
    detail = bodyText.slice(0, 200);
  }
  return `KI-Anfrage fehlgeschlagen (${status})${detail ? `: ${detail}` : ""}`;
}

async function sende({ provider, apiKey, model, messages, temperature }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llmTimeoutMs);
  try {
    return await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...provider.extraHeaders
      },
      body: JSON.stringify({
        model: model.apiModel || model.id,
        messages,
        temperature,
        response_format: { type: "json_object" }
      })
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new LlmError("Die KI hat nicht rechtzeitig geantwortet.");
    }
    throw new LlmError(`KI nicht erreichbar: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion({ model, messages, temperature = 0.1 }) {
  const provider = PROVIDERS[model.provider];
  if (!provider) {
    throw new LlmError(`Unbekannter Anbieter: ${model.provider}`);
  }

  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new LlmError(`Kein API-Schlüssel hinterlegt (${provider.apiKeyEnv}).`);
  }

  let response;
  let bodyText = "";
  for (let versuch = 0; ; versuch += 1) {
    response = await sende({ provider, apiKey, model, messages, temperature });
    bodyText = await response.text();
    if (response.ok || !WIEDERHOLBAR.has(response.status) || versuch >= WARTEZEITEN_MS.length) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const pause = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15000) : WARTEZEITEN_MS[versuch];
    console.warn(`KI-Anfrage ${response.status}, neuer Versuch in ${pause} ms (${model.id})`);
    await warte(pause);
  }

  if (!response.ok) {
    throw new LlmError(fehlertext(response.status, bodyText, model));
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new LlmError("Antwort der KI-Schnittstelle war kein JSON.");
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new LlmError("Die KI hat keine Antwort geliefert.");
  }

  return { content, usage: body.usage || null };
}

// Holt das erste JSON-Objekt aus einer Antwort, auch wenn es in ``` eingefasst ist.
export function extractJson(text) {
  // Denkmodelle (z. B. Qwen) schreiben ihre Überlegungen teils als <think>…</think> vor die Antwort
  const ohneDenken = String(text).replace(/<think>[\s\S]*?<\/think>/gi, "");
  const trimmed = ohneDenken.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new LlmError("Die Antwort der KI enthielt kein lesbares JSON.");
  }
}
