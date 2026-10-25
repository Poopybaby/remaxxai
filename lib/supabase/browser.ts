"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";

let client: Promise<SupabaseClient | null> | undefined;

/** Whether sign-in is set up on this deployment (cheap: no SDK loaded). */
export function isSupabaseConfiguredInBrowser(): boolean {
  return supabasePublicConfig() !== null;
}

/**
 * Browser Supabase client (publishable key only), or null when Supabase isn't configured.
 * The SDK (~70 KB gzipped) loads on first use, so pages that link to /login don't pay for it.
 * Call it early (e.g. when the email field gets focus) to have it ready by the time it's needed.
 */
export function loadSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  client ??= (async () => {
    const config = supabasePublicConfig();
    if (!config) return null;
    const { createBrowserClient } = await import("@supabase/ssr");
    return createBrowserClient(config.url, config.key);
  })().catch((err: unknown) => {
    client = undefined; // let the next attempt retry (e.g. after a network blip)
    throw err;
  });
  return client;
}
