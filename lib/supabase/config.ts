/** Public Supabase settings, safe in the browser. Null when Supabase hasn't been set up yet. */
export function supabasePublicConfig(): { url: string; key: string } | null {
  // NEXT_PUBLIC_* must be read as literal process.env.NAME so Next.js inlines them at build time.
  // The ANON_KEY name is what Vercel's Supabase integration creates; it works the same way.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  return url && key ? { url, key } : null;
}
