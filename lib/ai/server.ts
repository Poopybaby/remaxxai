import "server-only";
import { MODELS, type ModelEntry, type ProviderId } from "@/config/models";
import { getDb } from "@/lib/db/client";
import { serverEnv } from "@/lib/env";
import { moderate } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";
import type { PipelineDeps } from "./pipeline";
import { generate, type ProviderKeys } from "./providers";

/** Provider keys from the environment. Read on the server only; never sent to the browser. */
function providerKeys(): ProviderKeys {
  const env = serverEnv();
  return {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
    deepseek: env.DEEPSEEK_API_KEY,
  };
}

export function configuredProviders(): Set<ProviderId> {
  const keys = providerKeys();
  return new Set((Object.keys(keys) as ProviderId[]).filter((p) => Boolean(keys[p])));
}

/** What the model picker shows: every model, and whether it's usable on this deployment. */
export function modelOptions(): (Pick<
  ModelEntry,
  "id" | "label" | "vision" | "blurb" | "tier" | "inputPerMTok" | "outputPerMTok"
> & {
  available: boolean;
})[] {
  const ready = configuredProviders();
  return (MODELS as readonly ModelEntry[]).map((m) => ({
    id: m.id,
    label: m.label,
    vision: m.vision,
    blurb: m.blurb,
    tier: m.tier,
    inputPerMTok: m.inputPerMTok,
    outputPerMTok: m.outputPerMTok,
    available: ready.has(m.provider),
  }));
}

/**
 * The preferred model if its provider is set up, otherwise the first set-up model, cheapest
 * plans first. Null when no AI provider is configured at all.
 */
export function pickAvailableModel(preferredId: string): ModelEntry | null {
  const ready = configuredProviders();
  const all = MODELS as readonly ModelEntry[];
  const preferred = all.find((m) => m.id === preferredId);
  if (preferred && ready.has(preferred.provider)) return preferred;
  return (
    all.find((m) => m.tier === "starter" && ready.has(m.provider)) ??
    all.find((m) => ready.has(m.provider)) ??
    null
  );
}

export function aiAccessMode(): "admins" | "signed-in" {
  return serverEnv().AI_ACCESS ?? "admins";
}

export function productionAiDeps(): PipelineDeps {
  const env = serverEnv();
  return {
    db: getDb(),
    generate: (req) =>
      generate(req, { fetch, keys: providerKeys(), openaiBaseUrl: env.OPENAI_BASE_URL }),
    moderate,
    rateLimit: (key, rule) => rateLimit("ai", key, rule),
    accessMode: aiAccessMode(),
    configuredProviders: configuredProviders(),
  };
}
