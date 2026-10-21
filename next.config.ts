import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    qualities: [75],
    // Covers are served from our own /media route (uploads) and /seed (starter templates).
    localPatterns: [
      { pathname: "/media/**", search: "" },
      { pathname: "/seed/**", search: "" },
    ],
    remotePatterns: [
      // OAuth provider avatars (Google, GitHub) and Supabase Storage public buckets.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
