/** Rate limits, file limits and storage buckets. Tune here, not in feature code. */

export type RateLimitRule = { limit: number; windowMs: number };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  waitlist: { limit: 5, windowMs: 10 * MINUTE },
  profileUpdate: { limit: 20, windowMs: 10 * MINUTE },
  upload: { limit: 10, windowMs: HOUR },
  social: { limit: 120, windowMs: 10 * MINUTE },
  report: { limit: 10, windowMs: HOUR },
  dmca: { limit: 5, windowMs: HOUR },
  // Vibe searches that need a fresh embedding (cached queries and keyword searches are free).
  vibeSearch: { limit: 30, windowMs: MINUTE },
  remix: { limit: 20, windowMs: HOUR },
  editorSave: { limit: 120, windowMs: 10 * MINUTE },
} as const satisfies Record<string, RateLimitRule>;

/**
 * AI editor limits. Until credits exist (Phase 5) these are what keep costs bounded.
 * Every AI request also needs the person to pass `AI_ACCESS` (admins only by default).
 */
export const AI_LIMITS = {
  perMinute: { limit: 6, windowMs: MINUTE },
  /** Requests per person per UTC day; admins get more for testing. */
  perDay: 40,
  adminPerDay: 200,
  /** Site-wide estimated spend per UTC day across all models. AI pauses for everyone past it. */
  dailyBudgetUsd: 10,
  /** A person waits for one AI request to finish before starting another. */
  staleAfterMs: 3 * MINUTE,
  maxPromptChars: 2000,
  maxImages: 3,
  /** Per image, after the browser shrinks it (requests must stay under Vercel's 4.5 MB). */
  maxImageBytes: 900 * 1024,
  edit: { maxOutputTokens: 16000, timeoutMs: 110_000 },
  explain: { maxOutputTokens: 3000, timeoutMs: 60_000 },
  /** Earlier prompts and replies sent back to the model for context. */
  historyTurns: 6,
} as const;

const KB = 1024;
const MB = 1024 * KB;

/**
 * Upload limits. The total is capped below Vercel's 4.5 MB request body limit because uploads
 * go through a serverless function. Direct-to-storage uploads can raise this later.
 */
export const UPLOAD_LIMITS = {
  maxTotalBytes: 4 * MB,
  maxFileBytes: 2 * MB,
  maxFiles: 200,
  maxPathLength: 200,
  maxPathDepth: 8,
  coverMaxBytes: 2 * MB,
  /** Zip archives are unpacked in the browser; this guards against zip bombs before sending. */
  maxZipEntries: 400,
  maxUnzippedBytes: 8 * MB,
} as const;

export const PROJECT_TEXT_LIMITS = {
  titleMin: 3,
  titleMax: 80,
  descriptionMax: 1000,
  maxTags: 8,
  tagMaxLength: 24,
} as const;

export const STORAGE_BUCKETS = {
  /**
   * Reserved for large project files. In the MVP, project files are stored in Postgres
   * (blobs.content) because projects are capped at 4 MB; this bucket is the migration path.
   */
  projectFiles: {
    id: "project-files",
    public: false,
    fileSizeLimit: 5 * MB,
    allowedMimeTypes: null,
  },
  /** Project cover images shown in the gallery. */
  covers: {
    id: "covers",
    public: true,
    fileSizeLimit: 5 * MB,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  },
  avatars: {
    id: "avatars",
    public: true,
    fileSizeLimit: 2 * MB,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  },
} as const;

export type BucketKey = keyof typeof STORAGE_BUCKETS;
