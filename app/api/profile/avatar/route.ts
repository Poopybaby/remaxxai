import { updateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { RATE_LIMITS } from "@/config/limits";
import { AVATAR_MAX_BYTES, AvatarError, uploadAvatar } from "@/lib/avatars";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk } from "@/lib/editor/http";
import { moderate } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";

/** Uploads a profile picture. Multipart body with one `file` (already resized in the browser). */
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) return jsonError(503, "Accounts aren't set up yet.");
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "Sign in to change your picture.");
  if (!(await rateLimit("profile-update", viewer.userId, RATE_LIMITS.profileUpdate)).success) {
    return jsonError(429, "You're changing this too often. Wait a few minutes.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES + 64 * 1024) {
    return jsonError(413, "Use an image under 1 MB.");
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError(400, "We couldn't read that image. Try again.");
  }
  if (!(file instanceof Blob)) return jsonError(400, "Choose an image.");
  try {
    const res = await uploadAvatar(getDb(), viewer, new Uint8Array(await file.arrayBuffer()), {
      moderate,
    });
    updateTag(`profile:${res.handle}`);
    return jsonOk({ url: res.url });
  } catch (err) {
    if (err instanceof AvatarError) return jsonError(400, err.message);
    return handleRouteError(err, "profile.avatar");
  }
}
