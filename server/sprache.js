// Spracherkennung auf dem eigenen Server: Audio aus dem Browser an einen Whisper-Dienst
// mit OpenAI-kompatibler Schnittstelle (/v1/audio/transcriptions) weiterreichen.
// Das Audio wird nicht gespeichert, es liegt nur während der Anfrage im Speicher.
import { config } from "./config.js";

export class SpracheFehler extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "SpracheFehler";
    this.status = status;
  }
}

const ENDUNGEN = { webm: "webm", ogg: "ogg", mp4: "mp4", mpeg: "mp3", wav: "wav", "x-wav": "wav", aac: "aac", "x-m4a": "m4a" };

function dateiname(mimeType) {
  const unterart = String(mimeType || "").split(";")[0].split("/")[1] || "";
  return `aufnahme.${ENDUNGEN[unterart] || "webm"}`;
}

// Liefert den erkannten Text eines Audioabschnitts. vorher: Ende des vorigen Abschnitts als Zusammenhang.
export async function verschrifte(audio, { mimeType = "audio/webm", vorher = "" } = {}) {
  const { baseUrl, model, language, prompt, timeoutMs } = config.whisper;
  if (!baseUrl) throw new SpracheFehler("Die Spracherkennung auf dem Server ist nicht eingerichtet.", 503);

  const form = new FormData();
  form.append("file", new Blob([audio], { type: String(mimeType).split(";")[0] }), dateiname(mimeType));
  if (model) form.append("model", model);
  form.append("language", language);
  form.append("response_format", "json");
  // Stille vor der Erkennung entfernen, sonst erfindet Whisper bei Pausen gern Sätze
  form.append("vad_filter", "true");
  const zusammenhang = [prompt, String(vorher).slice(-200)].filter(Boolean).join(" ").trim();
  if (zusammenhang) form.append("prompt", zusammenhang);

  let res;
  try {
    res = await fetch(`${baseUrl}/v1/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const zeit = error.name === "TimeoutError" || error.name === "AbortError";
    throw new SpracheFehler(zeit ? "Die Spracherkennung hat zu lange gebraucht." : "Die Spracherkennung ist gerade nicht erreichbar.");
  }
  if (!res.ok) {
    throw new SpracheFehler(`Die Spracherkennung hat einen Fehler gemeldet (${res.status}).`);
  }
  const daten = await res.json().catch(() => null);
  if (!daten || typeof daten.text !== "string") throw new SpracheFehler("Die Spracherkennung hat keine verwertbare Antwort geliefert.");
  return daten.text.trim();
}
