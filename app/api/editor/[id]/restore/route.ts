import type { NextRequest } from "next/server";
import { z } from "zod";
import { RATE_LIMITS } from "@/config/limits";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk, UUID } from "@/lib/editor/http";
import { loadEditorFiles, restoreVersion } from "@/lib/projects/versions";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({ versionId: z.string().regex(UUID) });

/** Makes a new version from an older one (undo / restore) and returns its files. */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/editor/[id]/restore">,
) {
  const { id } = await params;
  if (!UUID.test(id) || !isDbConfigured()) return jsonError(404, "Not found");
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Sign in to edit.");
  if (!(await rateLimit("editor-save", viewer.userId, RATE_LIMITS.editorSave)).success) {
    return jsonError(429, "You're going very fast. Wait a moment.", "rate_limited");
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Pick a version to restore.", "bad_input");
  try {
    const db = getDb();
    const res = await restoreVersion(db, viewer, id, parsed.data.versionId);
    return jsonOk({ ...res, files: await loadEditorFiles(db, res.version.id) });
  } catch (err) {
    return handleRouteError(err, "editor.restore");
  }
}
