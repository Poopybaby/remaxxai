import type { NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_EXPLAIN_MODEL_ID } from "@/config/models";
import { pickAvailableModel, productionAiDeps } from "@/lib/ai/server";
import { explainVersion } from "@/lib/ai/services";
import { getViewer } from "@/lib/auth/viewer";
import { isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk, UUID } from "@/lib/editor/http";

export const maxDuration = 90;

const body = z.object({
  versionId: z.string().regex(UUID),
  modelId: z.string().max(40).default(DEFAULT_EXPLAIN_MODEL_ID),
});

/** "Break it down": a plain-English walkthrough of a project version (cached after the first). */
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return jsonError(404, "Not found");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Pick a project to explain.", "bad_input");
  // Fall back to whichever model is set up, so the button works with any single provider key.
  const model = pickAvailableModel(parsed.data.modelId);
  try {
    const res = await explainVersion(productionAiDeps(), {
      viewer: await getViewer(),
      versionId: parsed.data.versionId,
      modelId: model?.id ?? parsed.data.modelId,
    });
    if (!res.ok) return jsonError(res.status, res.error, res.code);
    return jsonOk(res);
  } catch (err) {
    return handleRouteError(err, "explain");
  }
}
