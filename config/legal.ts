/**
 * Versions of the legal documents users accept at sign-up.
 * Bump a version when the document changes materially; acceptances are recorded per version.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-10-25-draft",
  acceptableUse: "2026-10-21-draft",
  privacy: "2026-10-25-draft",
} as const;

/** Decided Oct 21, 2026: REMAXX is 18+ at launch. */
export const MINIMUM_AGE = 18;

/** Shown on every legal page until a lawyer has reviewed it. */
export const LEGAL_PAGES_ARE_DRAFTS = true;
