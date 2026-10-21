import { NextResponse, type NextRequest } from "next/server";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getProfileById } from "@/lib/profiles";
import { safeNextPath } from "@/lib/security/hosts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing point for magic links and Google/GitHub sign-in. Exchanges the one-time code for a
 * session cookie, then sends first-time users to onboarding and everyone else onward.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/");

  if (searchParams.get("error")) {
    return NextResponse.redirect(
      new URL(`/login?error=oauth&next=${encodeURIComponent(next)}`, origin),
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) {
    return NextResponse.redirect(
      new URL(`/login?error=callback&next=${encodeURIComponent(next)}`, origin),
    );
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(`/login?error=callback&next=${encodeURIComponent(next)}`, origin),
    );
  }

  const hasProfile = isDbConfigured()
    ? Boolean(await getProfileById(getDb(), data.user.id))
    : false;
  const destination = hasProfile ? next : `/onboarding?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(destination, origin));
}
