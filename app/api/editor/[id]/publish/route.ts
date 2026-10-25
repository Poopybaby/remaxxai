import { after, type NextRequest } from "next/server";
import { RATE_LIMITS, UPLOAD_LIMITS } from "@/config/limits";
import { getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk, UUID } from "@/lib/editor/http";
import { moderate } from "@/lib/moderation";
import { publishDraft, PublishError } from "@/lib/projects/publish";
import { rateLimit } from "@/lib/ratelimit";
import { refreshSearchIndex } from "@/lib/search/background";

/**
 * Publishes a draft remix. Multipart body:
 *   metadata  JSON (see lib/projects/metadata.ts)
 *   cover     optional raster image; without it the current cover is kept
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/editor/[id]/publish">,
) {
  const { id } = await params;
  if (!UUID.test(id) || !isDbConfigured()) return jsonError(404, "Not found");
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") return jsonError(401, "Sign in to publish.");
  if (ctx.status === "needs_onboarding")
    return jsonError(403, "Finish setting up your profile first.");
  // Publishing counts toward the same hourly limit as uploading.
  if (!(await rateLimit("upload", ctx.userId, RATE_LIMITS.upload)).success) {
    return jsonError(429, "You've published a lot recently. Try again in an hour.", "rate_limited");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > UPLOAD_LIMITS.coverMaxBytes + 64 * 1024) {
    return jsonError(413, "That cover image is too large.", "too_large");
  }

  let form: FormData;
  let metadata: unknown;
  try {
    form = await request.formData();
    metadata = JSON.parse(String(form.get("metadata") ?? "{}"));
  } catch {
    return jsonError(400, "We couldn't read that. Try again.", "bad_input");
  }
  const coverItem = form.get("cover");
  const cover = coverItem instanceof Blob ? new Uint8Array(await coverItem.arrayBuffer()) : null;

  try {
    const res = await publishDraft(
      getDb(),
      { userId: ctx.userId, role: ctx.profile.role },
      id,
      { metadata, cover },
      { moderate },
    );
    if (res.status === "published") after(() => refreshSearchIndex([id]).then(() => undefined));
    return jsonOk(res);
  } catch (err) {
    if (err instanceof PublishError) {
      return jsonOk({ error: err.message, field: err.field ?? null }, 400);
    }
    return handleRouteError(err, "editor.publish");
  }
}
