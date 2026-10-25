import type { NextRequest } from "next/server";
import { z } from "zod";
import { RATE_LIMITS } from "@/config/limits";
import { getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk } from "@/lib/editor/http";
import { createFromStarter } from "@/lib/projects/new-project";
import { RemixError } from "@/lib/projects/remix";
import { isStarterId } from "@/lib/projects/starters";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({
  starter: z.string().refine(isStarterId),
  idea: z.string().max(2000).optional(),
});

/** Starts a new private project from a starter. Returns its id; the editor opens it. */
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return jsonError(503, "Creating isn't set up on this site yet.");
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") return jsonError(401, "Sign in to create a project.");
  if (ctx.status === "needs_onboarding")
    return jsonError(403, "Finish setting up your profile first.");
  // Shares the remix limit: both make a new draft.
  if (!(await rateLimit("remix", ctx.userId, RATE_LIMITS.remix)).success) {
    return jsonError(429, "You've started a lot of projects this hour. Try again later.");
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isStarterId(parsed.data.starter)) {
    return jsonError(400, "Pick a starting point.");
  }
  try {
    const project = await createFromStarter(
      getDb(),
      { userId: ctx.userId, role: ctx.profile.role },
      { starter: parsed.data.starter, idea: parsed.data.idea },
    );
    return jsonOk({ id: project.id });
  } catch (err) {
    if (err instanceof RemixError) return jsonError(400, err.message);
    return handleRouteError(err, "create");
  }
}
