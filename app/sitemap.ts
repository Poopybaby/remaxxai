import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { listSitemapEntries } from "@/lib/projects/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = siteConfig.appUrl;
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    ...["terms", "acceptable-use", "privacy", "dmca"].map((p) => ({
      url: `${base}/legal/${p}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
  if (!isDbConfigured()) return pages;
  try {
    const { projects, creators } = await listSitemapEntries(getDb());
    return [
      ...pages,
      ...projects.map((p) => ({
        url: `${base}/p/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...creators.map((c) => ({
        url: `${base}/u/${c.handle}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch (err) {
    console.error("[sitemap]", err);
    return pages;
  }
}
