import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/** The app's robots.txt. The preview origin sends `X-Robots-Tag: noindex` on everything instead. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/edit/",
        "/drafts",
        "/billing",
        "/settings",
        "/notifications",
        "/collections",
        "/onboarding",
        "/upload",
        "/create",
        "/login",
        "/auth/",
      ],
    },
    sitemap: `${siteConfig.appUrl}/sitemap.xml`,
  };
}
