import { count, eq } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { siteConfig } from "@/config/site";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { supabasePublicConfig } from "@/lib/supabase/config";

/**
 * Setup check for whoever is deploying: which settings this deployment can see (yes/no only,
 * never the values) and whether the database answers. Visit /api/health after a deploy.
 */
export async function GET() {
  await connection();
  const env = serverEnv();
  const supabase = supabasePublicConfig();

  let database: string;
  if (!isDbConfigured()) {
    database = "missing: add DATABASE_URL";
  } else {
    try {
      const rows = await getDb()
        .select({ n: count() })
        .from(projects)
        .where(eq(projects.status, "published"));
      database = `ok: ${rows[0]?.n ?? 0} published templates`;
    } catch (err) {
      // Error codes only: messages can include the host name.
      const code = (err as { code?: string }).code ?? "unknown";
      database =
        code === "42P01"
          ? "connected, but the REMAXX tables aren't there: run the setup SQL"
          : `can't connect (error ${code}): check DATABASE_URL and its password`;
    }
  }

  return NextResponse.json(
    {
      supabaseSignIn: supabase
        ? "ok"
        : "missing: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy",
      supabaseSecretKey: env.SUPABASE_SECRET_KEY ? "ok" : "missing: add SUPABASE_SECRET_KEY",
      database,
      appUrl: siteConfig.appUrl,
      previewOrigin: siteConfig.previewOrigin,
      moderation: env.OPENAI_API_KEY ? "ok" : "off (optional for now)",
      rateLimitStore: env.UPSTASH_REDIS_REST_URL ? "ok" : "in-memory (optional for now)",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
