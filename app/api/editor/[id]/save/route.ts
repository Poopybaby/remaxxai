import type { NextRequest } from "next/server";
import { z } from "zod";
import { RATE_LIMITS, UPLOAD_LIMITS } from "@/config/limits";
import { linkReplyToVersion } from "@/lib/ai/pipeline";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk, UUID } from "@/lib/editor/http";
import { saveVersion } from "@/lib/projects/versions";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({
  baseVersionId: z.string().regex(UUID),
  files: z
    .array(
      z.union([
        z.object({ path: z.string().max(300), text: z.string() }),
        z.object({ path: z.string().max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
      ]),
    )
    .min(1)
    .max(UPLOAD_LIMITS.maxFiles),
  message: z.string().max(200).default(""),
  createdBy: z.enum(["user", "ai"]).default("user"),
  /** The AI reply this save accepts, so usage can be traced to the version it produced. */
  replyId: z.string().regex(UUID).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/editor/[id]/save">,
) {
  const { id } = await params;
  if (!UUID.test(id) || !isDbConfigured()) return jsonError(404, "Not found");
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Sign in to save.");
  if (!(await rateLimit("editor-save", viewer.userId, RATE_LIMITS.editorSave)).success) {
    return jsonError(429, "You're saving very fast. Wait a moment.", "rate_limited");
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, "That save wasn't in the expected shape.", "bad_input");
  try {
    const db = getDb();
    const res = await saveVersion(db, viewer, id, {
      baseVersionId: parsed.data.baseVersionId,
      files: parsed.data.files,
      message: parsed.data.message,
      createdBy: parsed.data.createdBy,
    });
    if (parsed.data.replyId && res.changed) {
      await linkReplyToVersion(db, viewer.userId, parsed.data.replyId, res.version.id);
    }
    return jsonOk(res);
  } catch (err) {
    return handleRouteError(err, "editor.save");
  }
}
