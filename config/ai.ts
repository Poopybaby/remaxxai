/**
 * Models used by platform features (vibe search). These are paid by REMAXX, not by user credits.
 * The remix editor's model list arrives in Phase 4 as its own registry.
 */
export const SEARCH_AI = {
  /** OpenAI embedding model; its output size must match vector(1536) in 0003_vibe_search.sql. */
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1536,
  /** Writes a short style description of an uploaded template from its code. */
  describeModel: process.env.VIBE_DESCRIBE_MODEL?.trim() || "gpt-5-mini",
  /** Per-call timeouts. Search falls back to keyword-only if embedding the query is slow. */
  embedTimeoutMs: 6000,
  describeTimeoutMs: 30000,
  /** How much of a template's HTML/CSS the describer sees. */
  describeMaxChars: 14000,
} as const;
