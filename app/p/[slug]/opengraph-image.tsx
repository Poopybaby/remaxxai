import { LICENSES } from "@/config/licenses";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getCreditChain } from "@/lib/licensing/chain";
import { loadImage, OG_CONTENT_TYPE, OG_SIZE, projectCard, siteCard } from "@/lib/og/card";
import { getProjectBySlug } from "@/lib/projects/queries";

export const alt = "A template you can remix on REMAXX";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isDbConfigured()) return siteCard();
  const db = getDb();
  const p = await getProjectBySlug(db, slug);
  // Only public projects get a card with their details.
  if (!p || p.status !== "published") return siteCard();
  const [cover, chain] = await Promise.all([loadImage(p.coverUrl), getCreditChain(db, p.id)]);
  return projectCard({
    title: p.title,
    handle: p.owner.handle,
    license: LICENSES[p.license.id].shortName,
    cover,
    remixedFrom: chain[0]?.available ? chain[0].title : null,
  });
}
