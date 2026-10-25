import { getDb, isDbConfigured } from "@/lib/db/client";
import { OG_CONTENT_TYPE, OG_SIZE, profileCard, siteCard } from "@/lib/og/card";
import { getPublicProfile } from "@/lib/profiles-public";
import { listProjectsByOwner } from "@/lib/projects/queries";

export const alt = "A creator on REMAXX";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile || !isDbConfigured()) return siteCard();
  const published = await listProjectsByOwner(getDb(), profile.id, { includeHidden: false });
  return profileCard({
    displayName: profile.displayName,
    handle: profile.handle,
    templates: published.length,
    // Avatars are external links; the server never fetches arbitrary URLs, so the card uses initials.
    avatar: null,
  });
}
