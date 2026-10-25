/**
 * One `generate()` for every AI provider. Each adapter turns the same request (system prompt,
 * messages, optional images) into that provider's API call and normalizes the answer, token
 * usage and errors. Plain fetch, no SDKs; `fetch` and keys are passed in so tests can fake them.
 */
import type { ModelEntry, ProviderId } from "@/config/models";

export type AiImage = {
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  base64: string;
};
export type AiMessage = { role: "user" | "assistant"; text: string; images?: AiImage[] };

export type GenerateRequest = {
  model: ModelEntry;
  system: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  timeoutMs: number;
};

export type GenerateResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** "length" means the answer was cut off at maxOutputTokens. */
  finish: "stop" | "length" | "other";
};

export type ProviderKeys = Partial<Record<ProviderId, string>>;
export type Deps = { fetch: typeof fetch; keys: ProviderKeys; openaiBaseUrl?: string };

export type AiErrorKind =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "out_of_credit"
  | "bad_request"
  | "refused"
  | "provider"
  | "empty";

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** A message safe to show the person. Never includes provider response bodies. */
export function friendlyAiError(err: unknown, modelLabel: string): string {
  if (!(err instanceof AiError)) return `${modelLabel} couldn't finish. Try again.`;
  switch (err.kind) {
    case "not_configured":
      return `${modelLabel} isn't set up on this site yet. Pick another model.`;
    case "timeout":
      return `${modelLabel} took too long. Try a smaller change, or another model.`;
    case "rate_limited":
      return `${modelLabel} is busy right now. Wait a moment and try again.`;
    case "out_of_credit":
      return `${modelLabel} is unavailable: the site's account with the provider needs credit.`;
    case "refused":
      return `${modelLabel} declined that request. Try rewording it.`;
    case "empty":
      return `${modelLabel} sent back an empty answer. Try again.`;
    default:
      return `${modelLabel} ran into a problem. Try again or pick another model.`;
  }
}

async function call(
  deps: Deps,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      ...init,
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new AiError("timeout", "Timed out");
    throw new AiError("provider", "Network error");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const code = body.match(/"(?:code|type|status)"\s*:\s*"([a-z_]+)"/i)?.[1] ?? "";
    if (res.status === 401 || res.status === 403) {
      throw new AiError("not_configured", `Key rejected (${res.status})`, res.status);
    }
    if (
      /credit|quota|billing|insufficient|balance/i.test(code + body.slice(0, 300)) ||
      res.status === 402
    ) {
      throw new AiError("out_of_credit", `Out of credit (${res.status} ${code})`, res.status);
    }
    if (res.status === 429 || res.status === 529 || res.status === 503) {
      throw new AiError("rate_limited", `Busy (${res.status})`, res.status);
    }
    if (res.status === 400 || res.status === 404 || res.status === 422) {
      throw new AiError("bad_request", `Rejected (${res.status} ${code})`, res.status);
    }
    throw new AiError("provider", `Provider error (${res.status})`, res.status);
  }
  return res.json();
}

function requireKey(deps: Deps, provider: ProviderId): string {
  const key = deps.keys[provider];
  if (!key) throw new AiError("not_configured", `No key for ${provider}`);
  return key;
}

// ── Anthropic (Messages API) ────────────────────────────────────────────────

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
};

async function anthropic(req: GenerateRequest, deps: Deps): Promise<GenerateResult> {
  const key = requireKey(deps, "anthropic");
  const data = (await call(
    deps,
    "https://api.anthropic.com/v1/messages",
    {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: req.model.apiModel,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: req.messages.map((m) => ({
          role: m.role,
          content: [
            ...(m.images ?? []).map((img) => ({
              type: "image",
              source: { type: "base64", media_type: img.mime, data: img.base64 },
            })),
            { type: "text", text: m.text },
          ],
        })),
      }),
    },
    req.timeoutMs,
  )) as AnthropicResponse;
  if (data.stop_reason === "refusal") throw new AiError("refused", "Refused");
  return {
    text: (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join(""),
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    finish:
      data.stop_reason === "max_tokens"
        ? "length"
        : data.stop_reason === "end_turn"
          ? "stop"
          : "other",
  };
}

// ── OpenAI and DeepSeek (Chat Completions) ──────────────────────────────────

type ChatResponse = {
  choices?: {
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

async function chatCompletions(req: GenerateRequest, deps: Deps): Promise<GenerateResult> {
  const provider = req.model.provider;
  const key = requireKey(deps, provider);
  const base =
    provider === "deepseek"
      ? "https://api.deepseek.com"
      : (deps.openaiBaseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const data = (await call(
    deps,
    `${base}/chat/completions`,
    {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model.apiModel,
        messages: [
          { role: "system", content: req.system },
          ...req.messages.map((m) =>
            m.images?.length
              ? {
                  role: m.role,
                  content: [
                    { type: "text", text: m.text },
                    ...m.images.map((img) => ({
                      type: "image_url",
                      image_url: { url: `data:${img.mime};base64,${img.base64}` },
                    })),
                  ],
                }
              : { role: m.role, content: m.text },
          ),
        ],
        // OpenAI's newer models only accept max_completion_tokens; DeepSeek uses max_tokens.
        ...(provider === "openai"
          ? { max_completion_tokens: req.maxOutputTokens }
          : { max_tokens: req.maxOutputTokens }),
      }),
    },
    req.timeoutMs,
  )) as ChatResponse;
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new AiError("refused", "Refused");
  return {
    text: choice?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    finish:
      choice?.finish_reason === "length"
        ? "length"
        : choice?.finish_reason === "stop"
          ? "stop"
          : "other",
  };
}

// ── Google (Gemini generateContent) ─────────────────────────────────────────

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

async function google(req: GenerateRequest, deps: Deps): Promise<GenerateResult> {
  const key = requireKey(deps, "google");
  const data = (await call(
    deps,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model.apiModel)}:generateContent`,
    {
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [
            ...(m.images ?? []).map((img) => ({
              inlineData: { mimeType: img.mime, data: img.base64 },
            })),
            { text: m.text },
          ],
        })),
        generationConfig: { maxOutputTokens: req.maxOutputTokens },
      }),
    },
    req.timeoutMs,
  )) as GeminiResponse;
  if (data.promptFeedback?.blockReason) throw new AiError("refused", "Blocked");
  const cand = data.candidates?.[0];
  const u = data.usageMetadata;
  return {
    text: (cand?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join(""),
    inputTokens: u?.promptTokenCount ?? 0,
    // Thinking tokens are billed as output.
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    finish:
      cand?.finishReason === "MAX_TOKENS"
        ? "length"
        : cand?.finishReason === "STOP"
          ? "stop"
          : "other",
  };
}

const ADAPTERS: Record<ProviderId, (req: GenerateRequest, deps: Deps) => Promise<GenerateResult>> =
  {
    anthropic,
    openai: chatCompletions,
    deepseek: chatCompletions,
    google,
  };

export async function generate(req: GenerateRequest, deps: Deps): Promise<GenerateResult> {
  if (!req.model.vision && req.messages.some((m) => m.images?.length)) {
    throw new AiError("bad_request", `${req.model.label} can't read images`);
  }
  const result = await ADAPTERS[req.model.provider](req, deps);
  if (!result.text.trim()) throw new AiError("empty", "Empty response");
  return result;
}
