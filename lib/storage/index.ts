import "server-only";
import { STORAGE_BUCKETS, type BucketKey } from "@/config/limits";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { blobKey, sha256Hex } from "./keys";

export type StoredBlob = { sha256: string; key: string; size: number };

/**
 * Stores bytes in the private project-files bucket under their content hash.
 * Uploading bytes that already exist is a no-op, which is what makes remixes free.
 */
export async function putBlob(bytes: Uint8Array, contentType: string): Promise<StoredBlob> {
  const sha256 = await sha256Hex(bytes);
  const key = blobKey(sha256);
  const { error } = await getSupabaseAdmin()
    .storage.from(STORAGE_BUCKETS.projectFiles.id)
    .upload(key, bytes, { contentType, upsert: false, cacheControl: "31536000" });
  if (error && !isAlreadyExists(error)) throw new Error(`Storage upload failed: ${error.message}`);
  return { sha256, key, size: bytes.byteLength };
}

export async function getBlob(sha256: string): Promise<Uint8Array> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(STORAGE_BUCKETS.projectFiles.id)
    .download(blobKey(sha256));
  if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export function publicUrl(bucket: Exclude<BucketKey, "projectFiles">, key: string): string {
  return getSupabaseAdmin().storage.from(STORAGE_BUCKETS[bucket].id).getPublicUrl(key).data
    .publicUrl;
}

function isAlreadyExists(error: { message: string; statusCode?: string }): boolean {
  return error.statusCode === "409" || /already exists|duplicate/i.test(error.message);
}
