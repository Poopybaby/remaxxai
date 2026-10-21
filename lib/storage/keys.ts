/**
 * Content-addressed storage keys. A file's key is derived from the SHA-256 of its bytes, so
 * identical files across versions and remixes are stored once and a remix copies no bytes.
 */

const SHA256_HEX = /^[a-f0-9]{64}$/;

export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Copy into a fresh ArrayBuffer-backed view so SubtleCrypto accepts it in every runtime.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value);
}

/** `blobs/ab/cd/abcd…` — two levels of fan-out keep any one storage prefix small. */
export function blobKey(sha256: string): string {
  if (!isSha256Hex(sha256)) throw new Error("blobKey expects a lowercase SHA-256 hex digest");
  return `blobs/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
}

/** Keys for user-owned public images (covers, avatars). Owner id first so cleanup is a prefix delete. */
export function ownedImageKey(
  ownerId: string,
  sha256: string,
  ext: "png" | "jpg" | "webp" | "gif",
): string {
  if (!/^[0-9a-f-]{36}$/.test(ownerId)) throw new Error("ownedImageKey expects a UUID owner id");
  if (!isSha256Hex(sha256)) throw new Error("ownedImageKey expects a lowercase SHA-256 hex digest");
  return `${ownerId}/${sha256}.${ext}`;
}
