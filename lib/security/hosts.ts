export type HostKind = "app" | "preview";

/**
 * Decides which origin a request is for. The preview origin must be a different registrable
 * domain from the app (e.g. remaxxusercontent.com vs remaxx.ai) so untrusted code can never
 * read or set app cookies.
 */
export function classifyHost(host: string | null, previewOrigin: string): HostKind {
  if (!host) return "app";
  return host.toLowerCase() === new URL(previewOrigin).host.toLowerCase() ? "preview" : "app";
}

/** Path prefix (inside the app) that the preview origin is rewritten to. */
export const PREVIEW_ROUTE_PREFIX = "/usercontent";

/** Paths that need a signed-in user. The page itself re-checks; this is the fast redirect. */
export const SIGNED_IN_PATHS = [
  "/onboarding",
  "/settings",
  "/admin",
  "/upload",
  "/collections",
  "/drafts",
  "/edit",
] as const;

export function requiresSignIn(pathname: string): boolean {
  return SIGNED_IN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only allow same-site relative redirects after sign-in (blocks open redirects like //evil.com). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}
