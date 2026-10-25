/**
 * The models people can pick in the remix editor. Adding a model is one entry here.
 *
 * - `id` is REMAXX's own name for the model (stored with each request; keep it stable).
 * - `apiModel` is the provider's model name. Providers rename models often: if one starts failing
 *   with "model not found", update `apiModel` here and redeploy.
 * - Prices are USD per million tokens, used for cost tracking now and credits in Phase 5.
 *   They are list prices gathered October 2026; check the provider's pricing page before launch.
 * - `tier` is the cheapest paid plan that will include the model once plans exist (Phase 5).
 */
export type ProviderId = "anthropic" | "openai" | "google" | "deepseek";

export type ModelEntry = {
  id: string;
  label: string;
  provider: ProviderId;
  apiModel: string;
  /** Accepts images in the prompt. The image button is hidden for models without it. */
  vision: boolean;
  tier: "starter" | "pro";
  inputPerMTok: number;
  outputPerMTok: number;
  /** One short line shown in the picker. */
  blurb: string;
};

export const MODELS = [
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    provider: "anthropic",
    apiModel: "claude-sonnet-5-5",
    vision: true,
    tier: "pro",
    inputPerMTok: 2,
    outputPerMTok: 10,
    blurb: "Careful, tasteful edits. Great all-rounder.",
  },
  {
    id: "claude-haiku",
    label: "Claude Haiku",
    provider: "anthropic",
    apiModel: "claude-haiku-5-5",
    vision: true,
    tier: "starter",
    inputPerMTok: 0.5,
    outputPerMTok: 2.5,
    blurb: "Fast and cheap for small tweaks.",
  },
  {
    id: "gpt",
    label: "ChatGPT (GPT-5.5)",
    provider: "openai",
    apiModel: "gpt-5.5",
    vision: true,
    tier: "pro",
    inputPerMTok: 5,
    outputPerMTok: 30,
    blurb: "OpenAI's flagship. Strong on tricky logic.",
  },
  {
    id: "gpt-mini",
    label: "ChatGPT mini",
    provider: "openai",
    apiModel: "gpt-5.4-mini",
    vision: true,
    tier: "starter",
    inputPerMTok: 0.75,
    outputPerMTok: 4.5,
    blurb: "Quick, low-cost OpenAI model.",
  },
  {
    id: "gemini-pro",
    label: "Gemini Pro",
    provider: "google",
    apiModel: "gemini-3.1-pro",
    vision: true,
    tier: "pro",
    inputPerMTok: 2,
    outputPerMTok: 12,
    blurb: "Google's top model. Good with big projects.",
  },
  {
    id: "gemini-flash",
    label: "Gemini Flash",
    provider: "google",
    apiModel: "gemini-3.6-flash",
    vision: true,
    tier: "starter",
    inputPerMTok: 0.75,
    outputPerMTok: 3.75,
    blurb: "Fast Google model for quick changes.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "deepseek",
    apiModel: "deepseek-flash",
    vision: false,
    tier: "starter",
    // Peak-hour prices (the higher of DeepSeek's two rates).
    inputPerMTok: 0.3,
    outputPerMTok: 1.2,
    blurb: "Very low cost. Text prompts only.",
  },
] as const satisfies readonly ModelEntry[];

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL_ID: ModelId = "claude-sonnet";

/** The model that writes "Break it down" explanations when none is chosen. */
export const DEFAULT_EXPLAIN_MODEL_ID: ModelId = "claude-haiku";

export const PROVIDERS: Record<ProviderId, { label: string; keyVar: string; keyUrl: string }> = {
  anthropic: {
    label: "Anthropic",
    keyVar: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    label: "OpenAI",
    keyVar: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  google: {
    label: "Google",
    keyVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  deepseek: {
    label: "DeepSeek",
    keyVar: "DEEPSEEK_API_KEY",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
};

export function getModel(id: string): ModelEntry | undefined {
  return (MODELS as readonly ModelEntry[]).find((m) => m.id === id);
}

/** Estimated cost of one request in USD. */
export function estimateCostUsd(
  model: ModelEntry,
  inputTokens: number,
  outputTokens: number,
): number {
  return (inputTokens * model.inputPerMTok + outputTokens * model.outputPerMTok) / 1_000_000;
}
