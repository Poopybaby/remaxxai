"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";

let client: SupabaseClient | null | undefined;

/** Browser Supabase client (publishable key only). Null when Supabase isn't configured. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const config = supabasePublicConfig();
  client = config ? createBrowserClient(config.url, config.key) : null;
  return client;
}
