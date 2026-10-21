import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterSignIn } from "@/lib/auth/after-sign-in";
import { safeNextPath } from "@/lib/security/hosts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPES: readonly EmailOtpType[] = ["email", "signup", "magiclink", "invite", "email_change"];

/**
 * Landing point for the sign-in and confirm-signup emails (templates in docs/email-templates.md).
 * Verifies the token on the server, so the link works in any browser or device, not only the one
 * that requested it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type") ?? "email";
  const next = safeNextPath(searchParams.get("next"), "/");
  const fail = (key: string) =>
    NextResponse.redirect(new URL(`/login?error=${key}&next=${encodeURIComponent(next)}`, origin));

  const type = TYPES.find((t) => t === typeParam);
  const supabase = await createSupabaseServerClient();
  if (!tokenHash || !type || !supabase) return fail("callback");

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return fail(error?.code === "otp_expired" ? "expired" : "callback");
  return NextResponse.redirect(new URL(await destinationAfterSignIn(data.user.id, next), origin));
}
