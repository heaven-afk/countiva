import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateGeminiJSON,
  DEFAULT_GEMINI_MODEL,
  AIServiceError,
} from "../src/lib/server/gemini.ts";
test("AI handles missing configuration, provider permissions, quota, model fallback and structured output safely", async () => {
  const previousKey = process.env.GEMINI_API_KEY,
    previousModel = process.env.GEMINI_MODEL,
    originalFetch = globalThis.fetch;
  try {
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(
      generateGeminiJSON("test", {}),
      (e: unknown) => e instanceof AIServiceError && e.kind === "configuration",
    );
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "retired-model";
    let calls = 0;
    globalThis.fetch = (async (url, init) => {
      calls++;
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "test-key",
      );
      if (String(url).includes("retired-model"))
        return new Response("{}", { status: 404 });
      assert.ok(String(url).includes(DEFAULT_GEMINI_MODEL));
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "private reasoning" },
                { text: '```json\n{"ok":true}\n```' },
              ],
            },
          },
        ],
      });
    }) as typeof fetch;
    const result = await generateGeminiJSON("test", { type: "object" });
    assert.deepEqual(result.data, { ok: true });
    assert.equal(calls, 2);
    for (const [status, kind] of [
      [403, "credentials"],
      [429, "quota"],
      [503, "provider"],
    ] as const) {
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({ error: { message: "secret value must not leak" } }),
          { status },
        )) as typeof fetch;
      await assert.rejects(
        generateGeminiJSON("test", {}),
        (e: unknown) =>
          e instanceof AIServiceError &&
          e.kind === kind &&
          !e.message.includes("secret value"),
      );
    }
    globalThis.fetch = (async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: "not JSON" }] } }],
      })) as typeof fetch;
    await assert.rejects(
      generateGeminiJSON("test", {}),
      (e: unknown) => e instanceof AIServiceError && e.kind === "output",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});
