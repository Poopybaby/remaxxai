import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "./config";

/**
 * Per-request Supabase client for Server Components, Server Actions and Route Handlers.
 * Returns null when Supabase isn't configured, so pages still render (as signed out).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const config = supabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. The proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}
