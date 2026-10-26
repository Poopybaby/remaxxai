import "server-only";
import { cacheLife } from "next/cache";
import { AUTH_PROVIDERS, enabledAuthProviders, type AuthProviderId } from "@/config/auth";
import { supabasePublicConfig } from "./config";

export type ProviderCheck = {
  /** Listed in NEXT_PUBLIC_AUTH_PROVIDERS and switched on in Supabase: these get buttons. */
  shown: AuthProviderId[];
  /** Listed, but Supabase says they're off (the button would only lead to an error page). */
  notEnabled: AuthProviderId[];
  /** Whether Supabase answered; if not, every listed provider is shown. */
  checked: boolean;
};

/** Pure: which listed providers Supabase reports as on (its /auth/v1/settings `external` map). */
export function reconcileProviders(listed: AuthProviderId[], external: unknown): ProviderCheck {
  if (!external || typeof external !== "object") {
    return { shown: listed, notEnabled: [], checked: false };
  }
  const on = external as Record<string, unknown>;
  const shown = listed.filter((p) => on[AUTH_PROVIDERS[p].supabase] === true);
  return { shown, notEnabled: listed.filter((p) => !shown.includes(p)), checked: true };
}

/**
 * Sign-in providers that will actually work: listed in NEXT_PUBLIC_AUTH_PROVIDERS and switched
 * on in Supabase. Cached for minutes, so switching one on in Supabase shows its button shortly
 * after, without a redeploy.
 */
export async function checkSignInProviders(): Promise<ProviderCheck> {
  "use cache";
  cacheLife("minutes");
  const listed = enabledAuthProviders();
  const config = supabasePublicConfig();
  if (!listed.length || !config) return { shown: listed, notEnabled: [], checked: false };
  try {
    const res = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { shown: listed, notEnabled: [], checked: false };
    const body = (await res.json()) as { external?: unknown };
    return reconcileProviders(listed, body.external);
  } catch {
    // Supabase unreachable: don't hide working buttons because of a blip.
    return { shown: listed, notEnabled: [], checked: false };
  }
}
