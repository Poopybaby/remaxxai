import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterSignIn, signInErrorKey } from "@/lib/auth/after-sign-in";
import { safeNextPath } from "@/lib/security/hosts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing point for Google/GitHub sign-in and default-template email links (PKCE). Exchanges
 * the one-time code for a session cookie, then sends first-time users to onboarding.
 * PKCE links only work in the browser that asked for them; /auth/confirm doesn't have that limit.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/");
  const fail = (key: string) =>
    NextResponse.redirect(new URL(`/login?error=${key}&next=${encodeURIComponent(next)}`, origin));

  if (searchParams.get("error")) return fail(signInErrorKey(searchParams));

  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) return fail("callback");

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    // Most often: the link was opened in a different browser from the one that requested it.
    return fail(
      error?.code === "bad_code_verifier" || /verifier/i.test(error?.message ?? "")
        ? "browser"
        : "callback",
    );
  }
  return NextResponse.redirect(new URL(await destinationAfterSignIn(data.user.id, next), origin));
}
