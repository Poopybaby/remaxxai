/** Rate limits, file limits and storage buckets. Tune here, not in feature code. */

export const RATE_LIMITS = {
  waitlist: { limit: 5, windowMs: 10 * 60 * 1000 },
  profileUpdate: { limit: 20, windowMs: 10 * 60 * 1000 },
} as const;

export type RateLimitRule = { limit: number; windowMs: number };

const MB = 1024 * 1024;

export const STORAGE_BUCKETS = {
  /** Content-addressed project files. Private: served only through the preview origin or signed URLs. */
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
