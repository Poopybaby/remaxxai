import { describe, expect, it } from "vitest";
import { getModel, type ModelEntry } from "@/config/models";
import {
  AiError,
  friendlyAiError,
  generate,
  type Deps,
  type GenerateRequest,
} from "@/lib/ai/providers";

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(response: { status?: number; json?: unknown; text?: string; delayMs?: number }) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    if (response.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, response.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
        });
      });
    }
    const status = response.status ?? 200;
    return new Response(response.text ?? JSON.stringify(response.json ?? {}), { status });
  }) as typeof fetch;
  return { fn, calls };
}

const KEYS = { anthropic: "ak", openai: "ok", google: "gk", deepseek: "dk" };
const req = (modelId: string, extra: Partial<GenerateRequest> = {}): GenerateRequest => ({
  model: getModel(modelId) as ModelEntry,
  system: "SYS",
  messages: [
    { role: "user", text: "make it pink", images: [{ mime: "image/png", base64: "AAAA" }] },
  ],
  maxOutputTokens: 100,
  timeoutMs: 1000,
  ...extra,
});
const deps = (fn: typeof fetch, keys = KEYS): Deps => ({ fetch: fn, keys });

describe("Anthropic adapter", () => {
  it("sends the Messages API shape with the image first, and reads text and usage", async () => {
    const f = fakeFetch({
      json: {
        content: [{ type: "text", text: "SUMMARY: done" }],
        usage: { input_tokens: 120, output_tokens: 30 },
        stop_reason: "end_turn",
      },
    });
    const res = await generate(req("claude-sonnet"), deps(f.fn));
    expect(res).toEqual({
      text: "SUMMARY: done",
      inputTokens: 120,
      outputTokens: 30,
      finish: "stop",
    });
    const call = f.calls[0]!;
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers["x-api-key"]).toBe("ak");
    expect(call.body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 100, system: "SYS" });
    expect(call.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
          { type: "text", text: "make it pink" },
        ],
      },
    ]);
  });

  it("marks answers that hit the token limit", async () => {
    const f = fakeFetch({
      json: { content: [{ type: "text", text: "x" }], stop_reason: "max_tokens" },
    });
    expect((await generate(req("claude-haiku"), deps(f.fn))).finish).toBe("length");
  });
});

describe("OpenAI-compatible adapter", () => {
  it("uses max_completion_tokens and data URLs for OpenAI", async () => {
    const f = fakeFetch({
      json: {
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 9, completion_tokens: 3 },
      },
    });
    const res = await generate(req("gpt"), deps(f.fn));
    expect(res).toMatchObject({ text: "ok", inputTokens: 9, outputTokens: 3, finish: "stop" });
    const call = f.calls[0]!;
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.headers.Authorization).toBe("Bearer ok");
    expect(call.body).toMatchObject({ model: "gpt-5.5", max_completion_tokens: 100 });
    expect(call.body.messages).toEqual([
      { role: "system", content: "SYS" },
      {
        role: "user",
        content: [
          { type: "text", text: "make it pink" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ],
      },
    ]);
  });

  it("goes to DeepSeek's endpoint with max_tokens, and refuses images for non-vision models", async () => {
    const f = fakeFetch({
      json: { choices: [{ message: { content: "ok" }, finish_reason: "length" }] },
    });
    await expect(generate(req("deepseek"), deps(f.fn))).rejects.toMatchObject({
      kind: "bad_request",
    });
    expect(f.calls).toHaveLength(0);
    const res = await generate(
      req("deepseek", { messages: [{ role: "user", text: "hi" }] }),
      deps(f.fn),
    );
    expect(res.finish).toBe("length");
    expect(f.calls[0]!.url).toBe("https://api.deepseek.com/chat/completions");
    expect(f.calls[0]!.body).toMatchObject({ model: "deepseek-flash", max_tokens: 100 });
  });

  it("honours a custom OpenAI base URL", async () => {
    const f = fakeFetch({ json: { choices: [{ message: { content: "ok" } }] } });
    await generate(req("gpt-mini"), {
      ...deps(f.fn),
      openaiBaseUrl: "https://gateway.example/v1/",
    });
    expect(f.calls[0]!.url).toBe("https://gateway.example/v1/chat/completions");
  });
});

describe("Google adapter", () => {
  it("sends system instruction and inline images, skips thoughts, counts thinking tokens", async () => {
    const f = fakeFetch({
      json: {
        candidates: [
          {
            content: { parts: [{ text: "thinking...", thought: true }, { text: "answer" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 5 },
      },
    });
    const res = await generate(req("gemini-flash"), deps(f.fn));
    expect(res).toEqual({ text: "answer", inputTokens: 50, outputTokens: 15, finish: "stop" });
    const call = f.calls[0]!;
    expect(call.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    );
    expect(call.headers["x-goog-api-key"]).toBe("gk");
    expect(call.body).toMatchObject({
      systemInstruction: { parts: [{ text: "SYS" }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: "AAAA" } },
            { text: "make it pink" },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 100 },
    });
  });

  it("reports a blocked prompt as refused", async () => {
    const f = fakeFetch({ json: { promptFeedback: { blockReason: "SAFETY" } } });
    await expect(generate(req("gemini-pro"), deps(f.fn))).rejects.toMatchObject({
      kind: "refused",
    });
  });
});

describe("errors", () => {
  it.each([
    [401, '{"error":{"type":"authentication_error"}}', "not_configured"],
    [429, '{"error":{"code":"rate_limit_exceeded"}}', "rate_limited"],
    [429, '{"error":{"code":"credit_balance_exhausted"}}', "out_of_credit"],
    [400, '{"error":{"type":"invalid_request_error"}}', "bad_request"],
    [404, '{"error":{"code":"model_not_found"}}', "bad_request"],
    [500, "oops", "provider"],
    [529, "overloaded", "rate_limited"],
  ])("HTTP %i maps to %s", async (status, text, kind) => {
    const f = fakeFetch({ status, text });
    await expect(generate(req("gpt-mini"), deps(f.fn))).rejects.toMatchObject({ kind });
  });

  it("fails fast without a key, and on timeout", async () => {
    const f = fakeFetch({ json: {} });
    await expect(
      generate(req("claude-sonnet"), deps(f.fn, { ...KEYS, anthropic: "" })),
    ).rejects.toMatchObject({
      kind: "not_configured",
    });
    const slow = fakeFetch({ json: {}, delayMs: 5000 });
    await expect(generate(req("gpt-mini", { timeoutMs: 20 }), deps(slow.fn))).rejects.toMatchObject(
      { kind: "timeout" },
    );
  });

  it("treats an empty answer as an error", async () => {
    const f = fakeFetch({ json: { choices: [{ message: { content: "  " } }] } });
    await expect(generate(req("gpt-mini"), deps(f.fn))).rejects.toMatchObject({ kind: "empty" });
  });

  it("gives people plain-language messages without provider details", () => {
    expect(friendlyAiError(new AiError("timeout", "x"), "Gemini Pro")).toBe(
      "Gemini Pro took too long. Try a smaller change, or another model.",
    );
    expect(friendlyAiError(new Error("secret stack trace"), "Claude")).toBe(
      "Claude couldn't finish. Try again.",
    );
  });
});
