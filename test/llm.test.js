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
