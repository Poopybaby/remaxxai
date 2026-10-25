/**
 * Sign-in providers. A button shows only when its provider is switched on in Supabase
 * (Auth → Sign In / Providers) AND listed in NEXT_PUBLIC_AUTH_PROVIDERS, e.g.
 * `google,microsoft,apple`. Setup steps for each: docs/DEPLOYMENT.md.
 */
export const AUTH_PROVIDERS = {
  google: { label: "Google", supabase: "google", scopes: undefined },
  // Supabase calls Microsoft sign-in "azure". `email` is needed to receive the address.
  microsoft: { label: "Microsoft", supabase: "azure", scopes: "email" },
  apple: { label: "Apple", supabase: "apple", scopes: undefined },
  github: { label: "GitHub", supabase: "github", scopes: undefined },
} as const;

export type AuthProviderId = keyof typeof AUTH_PROVIDERS;

/** Display order: the most-used first. */
const ORDER: AuthProviderId[] = ["google", "microsoft", "apple", "github"];

const ALIASES: Record<string, AuthProviderId> = { azure: "microsoft" };

export function enabledAuthProviders(
  raw: string | undefined = process.env.NEXT_PUBLIC_AUTH_PROVIDERS,
): AuthProviderId[] {
  const listed = new Set(
    (raw ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .map((p) => ALIASES[p] ?? p),
  );
  return ORDER.filter((p) => listed.has(p));
}
