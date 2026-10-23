import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Minimal OpenAI client for platform features, using fetch so there's no SDK to keep in sync.
 * The key is read on the server only and never sent to the browser.
 */
const DEFAULT_BASE = "https://api.openai.com/v1";

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function isOpenAiConfigured(): boolean {
  return Boolean(serverEnv().OPENAI_API_KEY);
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const { OPENAI_API_KEY: key, OPENAI_BASE_URL: base } = serverEnv();
  if (!key) throw new AiUnavailableError("OPENAI_API_KEY is not set");
  let res: Response;
  try {
    res = await fetch(`${(base ?? DEFAULT_BASE).replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new AiUnavailableError(timedOut ? `OpenAI ${path} timed out` : `OpenAI ${path} failed`);
  }
  if (!res.ok) {
    // The body can echo parts of the request; keep only the status and error type.
    const detail = await res
      .json()
      .then((j: { error?: { type?: string; code?: string } }) => j.error?.code ?? j.error?.type)
      .catch(() => undefined);
    throw new AiUnavailableError(
      `OpenAI ${path} returned ${res.status}${detail ? ` (${detail})` : ""}`,
    );
  }
  return (await res.json()) as T;
}

/** Embeds up to a few hundred short texts in one call. Returns vectors in input order. */
export async function openAiEmbed(
  model: string,
  dimensions: number,
  input: string[],
  timeoutMs: number,
): Promise<number[][]> {
  if (input.length === 0) return [];
  const res = await post<{ data: { index: number; embedding: number[] }[] }>(
    "/embeddings",
    { model, input, dimensions },
    timeoutMs,
  );
  const out = new Array<number[]>(input.length);
  for (const d of res.data) out[d.index] = d.embedding;
  if (out.some((v) => !v || v.length !== dimensions)) {
    throw new AiUnavailableError("OpenAI returned embeddings of the wrong size");
  }
  return out;
}

/** One-shot text completion. Used for short, low-stakes writing such as style descriptions. */
export async function openAiComplete(
  model: string,
  system: string,
  user: string,
  timeoutMs: number,
): Promise<string> {
  const res = await post<{ choices: { message: { content: string | null } }[] }>(
    "/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Reasoning models spend part of this on thinking, so leave room beyond the ~80-word answer.
      max_completion_tokens: 2000,
    },
    timeoutMs,
  );
  const text = res.choices[0]?.message.content?.trim();
  if (!text) throw new AiUnavailableError("OpenAI returned an empty description");
  return text;
}
