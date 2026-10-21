import "server-only";
import { cache } from "react";
import { getDb, isDbConfigured } from "@/lib/db/client";
import type { Profile } from "@/lib/db/schema";
import { getProfileById } from "@/lib/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Viewer } from "./permissions";

export type ViewerContext =
  | { status: "anonymous" }
  | {
      status: "needs_onboarding";
      userId: string;
      email: string | null;
      suggestedName: string | null;
      avatarUrl: string | null;
    }
  | { status: "active"; userId: string; email: string | null; profile: Profile };

/**
 * Resolves who is making this request. Verifies the session JWT with getClaims() (never trusts
 * an unverified cookie), then loads the profile. Deduplicated per request.
 * Reads cookies, so call it inside a <Suspense> boundary or from an action/route handler.
 */
export const getViewerContext = cache(async (): Promise<ViewerContext> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "anonymous" };

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "anonymous" };

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;

  const profile = isDbConfigured() ? await getProfileById(getDb(), userId) : null;
  if (profile) return { status: "active", userId, email, profile };

  return {
    status: "needs_onboarding",
    userId,
    email,
    suggestedName: firstString(meta.full_name, meta.name, meta.user_name),
    avatarUrl: firstString(meta.avatar_url, meta.picture),
  };
});

/** The permission-check view of the current request: null unless signed in with a profile. */
export async function getViewer(): Promise<Viewer> {
  const ctx = await getViewerContext();
  return ctx.status === "active" ? { userId: ctx.userId, role: ctx.profile.role } : null;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}
