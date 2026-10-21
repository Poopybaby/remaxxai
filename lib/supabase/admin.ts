import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MissingConfigError, serverEnv } from "@/lib/env";

let admin: SupabaseClient | undefined;

/**
 * Supabase client with the secret (service role) key. Bypasses RLS and storage policies.
 * Server-only: never import from a Client Component.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = serverEnv();
  if (!url || !key) {
    throw new MissingConfigError("Supabase admin access", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
    ]);
  }
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
