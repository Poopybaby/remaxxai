import type { NextRequest } from "next/server";
import { z } from "zod";
import { AI_LIMITS } from "@/config/limits";
import { productionAiDeps } from "@/lib/ai/server";
import { proposeEdit } from "@/lib/ai/services";
import type { AiImage } from "@/lib/ai/providers";
import { getViewer } from "@/lib/auth/viewer";
import { isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk, UUID } from "@/lib/editor/http";
import { detectCoverType } from "@/lib/upload/mime";

// Model calls can take a while; the pipeline's own timeout (110 s) fires first.
export const maxDuration = 120;

const body = z.object({
  baseVersionId: z.string().regex(UUID),
  files: z.record(z.string().max(300), z.string()),
  prompt: z.string().max(AI_LIMITS.maxPromptChars),
  modelId: z.string().max(40),
  images: z
    .array(z.object({ base64: z.string().max(Math.ceil((AI_LIMITS.maxImageBytes * 4) / 3) + 8) }))
    .max(AI_LIMITS.maxImages)
    .default([]),
});

/** Asks the chosen model for changes to the draft. Returns a proposal; nothing is saved. */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/editor/[id]/ai">) {
  const { id } = await params;
  if (!UUID.test(id) || !isDbConfigured()) return jsonError(404, "Not found");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, "That request wasn't in the expected shape.", "bad_input");

  // Images: checked by their actual bytes, not by what the browser claims they are.
  const images: AiImage[] = [];
  for (const img of parsed.data.images) {
    const bytes = Buffer.from(img.base64, "base64");
    const type = detectCoverType(bytes);
    if (!type || bytes.byteLength > AI_LIMITS.maxImageBytes) {
      return jsonError(400, "Attach PNG, JPG, WebP or GIF images under 1 MB.", "bad_input");
    }
    images.push({ mime: type.mime as AiImage["mime"], base64: img.base64 });
  }

  try {
    const res = await proposeEdit(productionAiDeps(), {
      viewer: await getViewer(),
      projectId: id,
      baseVersionId: parsed.data.baseVersionId,
      files: parsed.data.files,
      prompt: parsed.data.prompt,
      images,
      modelId: parsed.data.modelId,
    });
    if (!res.ok) return jsonError(res.status, res.error, res.code);
    return jsonOk(res);
  } catch (err) {
    return handleRouteError(err, "editor.ai");
  }
}
