import "server-only";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getProfileById } from "@/lib/profiles";

/** Where to send someone who just signed in: onboarding the first time, otherwise `next`. */
export async function destinationAfterSignIn(userId: string, next: string): Promise<string> {
  const hasProfile = isDbConfigured() ? Boolean(await getProfileById(getDb(), userId)) : false;
  return hasProfile ? next : `/onboarding?next=${encodeURIComponent(next)}`;
}

/** Turns Supabase's error codes on a returned sign-in link into our login-page error keys. */
export function signInErrorKey(params: URLSearchParams): string {
  const code = params.get("error_code") ?? "";
  if (code === "otp_expired" || /expired|invalid/i.test(params.get("error_description") ?? "")) {
    return "expired";
  }
  return params.get("error") === "access_denied" ? "denied" : "callback";
}
