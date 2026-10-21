/**
 * Public, non-secret site settings. Values here are safe to ship to the browser.
 * NEXT_PUBLIC_* variables must be read with literal `process.env.NAME` so Next.js can inline them.
 */
export const siteConfig = {
  name: "REMAXX",
  description:
    "Browse AI-built sites, tools and UI kits, remix them by describing what you want, and publish your version with credit to the original maker.",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** Separate registrable domain that serves untrusted previews. Never a subdomain of the app. */
  previewOrigin: process.env.NEXT_PUBLIC_PREVIEW_ORIGIN ?? "http://127.0.0.1:3000",
  contact: {
    legal: "legal@remaxx.ai",
    dmca: "dmca@remaxx.ai",
    privacy: "privacy@remaxx.ai",
  },
} as const;

export function hostOf(url: string): string {
  return new URL(url).host;
}
