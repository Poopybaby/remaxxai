import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterSignIn } from "@/lib/auth/after-sign-in";
import { safeNextPath } from "@/lib/security/hosts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** After signing in with an emailed code in the browser: onboarding the first time, else `next`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/");
  const supabase = await createSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const userId = data?.claims.sub;
  if (!userId) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin));
  }
  return NextResponse.redirect(new URL(await destinationAfterSignIn(userId, next), origin));
}
