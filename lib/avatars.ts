/**
 * Changing a profile picture: pick one of the REMAXX crew, or upload your own.
 * Uploads are treated like any untrusted image: type checked by their bytes (not the name),
 * size-limited, moderated, and stored by content hash (served from /media like covers).
 */
import { eq } from "drizzle-orm";
import { defaultAvatar } from "@/config/avatars";
import { assert, canEditProfile, type Viewer } from "@/lib/auth/permissions";
import { blobs, profiles } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import type { ModerationVerdict } from "@/lib/moderation";
import { sha256Hex } from "@/lib/storage/keys";
import { detectCoverType } from "@/lib/upload/mime";

/** Uploaded pictures are resized in the browser to 512×512 first, so this is generous. */
export const AVATAR_MAX_BYTES = 1024 * 1024;

export class AvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarError";
  }
}

async function save(db: Db, viewer: Viewer, avatarUrl: string): Promise<string> {
  assert(viewer !== null && canEditProfile(viewer, viewer.userId), "Sign in to change this.");
  const [row] = await db
    .update(profiles)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(profiles.id, viewer.userId))
    .returning({ handle: profiles.handle });
  if (!row) throw new AvatarError("Finish setting up your profile first.");
  return row.handle;
}

/** Switches to one of the built-in avatars. Returns the person's handle. */
export async function chooseDefaultAvatar(db: Db, viewer: Viewer, id: string): Promise<string> {
  const avatar = defaultAvatar(id);
  if (!avatar) throw new AvatarError("Pick one of the avatars shown.");
  return save(db, viewer, avatar.url);
}

/** Saves an uploaded picture and makes it the profile picture. Returns its URL and the handle. */
export async function uploadAvatar(
  db: Db,
  viewer: Viewer,
  bytes: Uint8Array,
  deps: { moderate: (input: { imageDataUrls: string[] }) => Promise<ModerationVerdict> },
): Promise<{ url: string; handle: string }> {
  assert(viewer !== null, "Sign in to change this.");
  const type = detectCoverType(bytes);
  if (!type) throw new AvatarError("Use a PNG, JPG, WebP or GIF image.");
  if (bytes.byteLength > AVATAR_MAX_BYTES) throw new AvatarError("Use an image under 1 MB.");

  const dataUrl = `data:${type.mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const verdict = await deps.moderate({ imageDataUrls: [dataUrl] });
  // Profile pictures show everywhere right away and have no review queue, so a flag is a no.
  if (verdict.verdict === "block" || verdict.verdict === "flag") {
    throw new AvatarError("That picture can't be used here. Try a different one.");
  }

  const sha = await sha256Hex(bytes);
  await db
    .insert(blobs)
    .values({ sha256: sha, size: bytes.byteLength, content: bytes })
    .onConflictDoNothing();
  const url = `/media/${sha}.${type.ext}`;
  const handle = await save(db, viewer, url);
  return { url, handle };
}
