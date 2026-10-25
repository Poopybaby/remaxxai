import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Content moderation for user text and images, via OpenAI's moderation endpoint (free to use).
 * Without OPENAI_API_KEY, moderation is skipped and the skip is recorded, so admins can see which
 * uploads went unchecked. A provider outage also counts as "skipped": uploads never fail because
 * moderation is down, but the scanner and reports still apply.
 */

export type ModerationVerdict = {
  verdict: "pass" | "flag" | "block" | "skipped";
  categories: string[];
  source: "openai" | "skipped";
};

const MODEL = "omni-moderation-latest";
const TIMEOUT_MS = 8000;

/** Categories that reject content outright; anything else flagged goes to admin review. */
const BLOCKING = new Set([
  "sexual/minors",
  "self-harm/instructions",
  "violence/graphic",
  "hate/threatening",
]);

type OpenAIModerationResponse = {
  results?: { flagged: boolean; categories: Record<string, boolean> }[];
};

export async function moderate(input: {
  texts?: string[];
  imageDataUrls?: string[];
}): Promise<ModerationVerdict> {
  const { OPENAI_API_KEY: key, OPENAI_BASE_URL: base } = serverEnv();
  const texts = (input.texts ?? []).map((t) => t.trim()).filter(Boolean);
  const images = input.imageDataUrls ?? [];
  if (!key) return { verdict: "skipped", categories: [], source: "skipped" };
  if (texts.length === 0 && images.length === 0)
    return { verdict: "pass", categories: [], source: "openai" };

  const body = {
    model: MODEL,
    input: [
      ...(texts.length ? [{ type: "text", text: texts.join("\n\n").slice(0, 10_000) }] : []),
      ...images.map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  };

  try {
    const res = await fetch(
      `${(base ?? "https://api.openai.com/v1").replace(/\/$/, "")}/moderations`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.error("Moderation request failed", res.status);
      return { verdict: "skipped", categories: [], source: "skipped" };
    }
    const data = (await res.json()) as OpenAIModerationResponse;
    const categories = [
      ...new Set(
        (data.results ?? []).flatMap((r) =>
          Object.entries(r.categories)
            .filter(([, v]) => v)
            .map(([k]) => k),
        ),
      ),
    ];
    if (categories.some((c) => BLOCKING.has(c)))
      return { verdict: "block", categories, source: "openai" };
    if ((data.results ?? []).some((r) => r.flagged))
      return { verdict: "flag", categories, source: "openai" };
    return { verdict: "pass", categories, source: "openai" };
  } catch (err) {
    console.error("Moderation request errored", err);
    return { verdict: "skipped", categories: [], source: "skipped" };
  }
}
