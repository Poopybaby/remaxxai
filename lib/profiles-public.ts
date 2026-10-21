import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { validateHandle } from "@/lib/auth/handles";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getProfileByHandle } from "@/lib/profiles";

/** The fields of a profile anyone may see. Never includes role, email or age confirmation. */
export type PublicProfile = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  websiteUrl: string | null;
  joinedAt: string;
};

/** Cached public profile lookup, invalidated by updateTag(`profile:<handle>`) when the owner edits it. */
export async function getPublicProfile(rawHandle: string): Promise<PublicProfile | null> {
  "use cache";
  const check = validateHandle(rawHandle);
  if (!check.ok && check.error !== "reserved") return null;
  const handle = rawHandle.toLowerCase();
  cacheTag(`profile:${handle}`);
  cacheLife("minutes");

  if (!isDbConfigured()) return null;
  const p = await getProfileByHandle(getDb(), handle);
  if (!p) return null;
  return {
    id: p.id,
    handle: p.handle,
    displayName: p.displayName,
    bio: p.bio,
    avatarUrl: p.avatarUrl,
    websiteUrl: p.websiteUrl,
    joinedAt: p.createdAt.toISOString(),
  };
}
