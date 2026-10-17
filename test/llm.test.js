import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPENROUTER_API_KEY = "test-key";
const { chatCompletion, LlmError } = await import("../server/llm.js");

const model = { id: "mistralai/mistral-small-2603", label: "Mistral Small 4", provider: "openrouter" };
const ok = { choices: [{ message: { content: "{\"ok\":true}" } }] };

function antwort(status, body, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

test("Bei 429 wird erneut versucht", async () => {
  const original = globalThis.fetch;
  const folge = [antwort(429, { error: { message: "rate limited" } }, { "retry-after": "0.01" }), antwort(200, ok)];
  let aufrufe = 0;
  globalThis.fetch = async () => {
    aufrufe += 1;
    return folge.shift();
  };
  try {
    const { content } = await chatCompletion({ model, messages: [] });
    assert.equal(content, "{\"ok\":true}");
    assert.equal(aufrufe, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("Dauerhaft 429 ergibt verständliche Meldung", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => antwort(429, { error: { message: "rate limited" } }, { "retry-after": "0.01" });
  try {
    await assert.rejects(chatCompletion({ model, messages: [] }), (error) => {
      assert.ok(error instanceof LlmError);
      assert.match(error.message, /ausgelastet/);
      assert.doesNotMatch(error.message, /\{/);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("Myra erscheint erst mit Adresse und Token, Adresse wird bereinigt", async () => {
  process.env.MYRA_API_KEY = "myra_test";
  process.env.MYRA_BASE_URL = "https://ai.myra.eu/v1/mandant/gateway/compat/chat/completions/";
  const { PROVIDERS, verfuegbareModelle } = await import(`../server/config.js?myra=${Date.now()}`);
  assert.equal(PROVIDERS.myra.baseUrl, "https://ai.myra.eu/v1/mandant/gateway/compat");
  assert.ok(verfuegbareModelle().some((m) => m.id === "myra/qwen3.8-27b"));
  delete process.env.MYRA_API_KEY;
  assert.ok(!verfuegbareModelle().some((m) => m.provider === "myra"));
});

test("MYRA_MODELLE legt die Myra-Modelle fest, auch unbekannte", async () => {
  process.env.MYRA_API_KEY = "myra_test";
  process.env.MYRA_BASE_URL = "https://ai.myra.eu/v1/mandant/gateway/compat";
  process.env.MYRA_MODELLE = "claude-haiku-4-5, neues-modell";
  const { verfuegbareModelle } = await import(`../server/config.js?modelle=${Date.now()}`);
  const myra = verfuegbareModelle().filter((m) => m.provider === "myra");
  assert.deepEqual(myra.map((m) => m.apiModel), ["claude-haiku-4-5", "neues-modell"]);
  assert.equal(myra[0].label, "Claude Haiku 4.5 (über Myra)");
  delete process.env.MYRA_MODELLE;
  delete process.env.MYRA_API_KEY;
});

test("Myra-Regelverstoß mit 403 wird verständlich gemeldet", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => antwort(403, { error: { code: "model_disabled_on_gateway", message: "Model is disabled on this gateway" } });
  try {
    await assert.rejects(chatCompletion({ model, messages: [] }), (error) => {
      assert.match(error.message, /model_disabled_on_gateway/);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("Überlegungen eines Denkmodells vor dem JSON werden übersprungen", async () => {
  const { extractJson } = await import("../server/llm.js");
  assert.deepEqual(extractJson("<think>Erst {Rollen} sammeln.</think>\n{\"ok\":true}"), { ok: true });
});
