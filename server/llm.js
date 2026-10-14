// Anbindung an OpenAI-kompatible Chat-Schnittstellen (OpenRouter, Mistral).
import { PROVIDERS, config } from "./config.js";

export class LlmError extends Error {}

export async function chatCompletion({ model, messages, temperature = 0.1 }) {
  const provider = PROVIDERS[model.provider];
  if (!provider) {
    throw new LlmError(`Unbekannter Anbieter: ${model.provider}`);
  }

  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new LlmError(`Kein API-Schlüssel hinterlegt (${provider.apiKeyEnv}).`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llmTimeoutMs);

  let response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...provider.extraHeaders
      },
      body: JSON.stringify({
        model: model.id,
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

  const bodyText = await response.text();
  if (!response.ok) {
    throw new LlmError(`KI-Anfrage fehlgeschlagen (${response.status}): ${bodyText.slice(0, 300)}`);
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
  const trimmed = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
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
