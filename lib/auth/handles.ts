/**
 * Handle rules. Mirrors the CHECK constraint on profiles.handle:
 * 3–30 chars, lowercase letters, digits and single underscores, starting and ending
 * with a letter or digit.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/;

/** Words that would collide with routes, impersonate staff, or confuse people. */
const RESERVED = new Set([
  "about",
  "account",
  "admin",
  "administrator",
  "api",
  "app",
  "auth",
  "billing",
  "blog",
  "collections",
  "contact",
  "dmca",
  "docs",
  "editor",
  "explore",
  "help",
  "home",
  "legal",
  "login",
  "logout",
  "me",
  "mod",
  "moderator",
  "new",
  "notifications",
  "onboarding",
  "p",
  "privacy",
  "remaxx",
  "remaxx_ai",
  "remaxxai",
  "remix",
  "root",
  "search",
  "security",
  "settings",
  "signin",
  "signout",
  "signup",
  "staff",
  "support",
  "system",
  "terms",
  "u",
  "upload",
  "usercontent",
  "www",
]);

export type HandleError = "too_short" | "too_long" | "invalid_chars" | "reserved";

export const HANDLE_ERROR_MESSAGES: Record<HandleError, string> = {
  too_short: `Handles need at least ${HANDLE_MIN} characters.`,
  too_long: `Handles can be at most ${HANDLE_MAX} characters.`,
  invalid_chars:
    "Use lowercase letters, numbers and single underscores, starting and ending with a letter or number.",
  reserved: "That handle is reserved. Try another one.",
};

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export function validateHandle(
  input: string,
): { ok: true; handle: string } | { ok: false; error: HandleError } {
  const handle = normalizeHandle(input);
  if (handle.length < HANDLE_MIN) return { ok: false, error: "too_short" };
  if (handle.length > HANDLE_MAX) return { ok: false, error: "too_long" };
  if (!HANDLE_PATTERN.test(handle) || handle.includes("__"))
    return { ok: false, error: "invalid_chars" };
  if (RESERVED.has(handle)) return { ok: false, error: "reserved" };
  return { ok: true, handle };
}

/** Turns an email or display name into a valid handle suggestion, or null if nothing usable remains. */
export function suggestHandle(source: string): string | null {
  const base = source.split("@")[0] ?? "";
  let candidate = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/_+$/g, "");
  if (candidate.length > 0 && candidate.length < HANDLE_MIN) candidate = `${candidate}_maker`;
  const result = validateHandle(candidate);
  if (result.ok) return result.handle;
  if (result.error === "reserved") {
    const alt = validateHandle(`${candidate}_1`);
    return alt.ok ? alt.handle : null;
  }
  return null;
}
