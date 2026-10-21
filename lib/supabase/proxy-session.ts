import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "./config";

/**
 * Refreshes the Supabase session cookie on every app request and reports whether the
 * request carries a verified session. Runs in proxy.ts before any page renders.
 */
export async function refreshSession(
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request });
  const config = supabasePublicConfig();
  if (!config) return { response, userId: null };

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Must run before the response is returned so refreshed tokens land in Set-Cookie.
  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims?.sub ?? null };
}
