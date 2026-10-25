import { count, eq } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { siteConfig } from "@/config/site";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { aiAccessMode, configuredProviders } from "@/lib/ai/server";
import { stripeMode } from "@/lib/billing/stripe";
import { embedQuery, getEmbedder } from "@/lib/search/ai";
import { supabasePublicConfig } from "@/lib/supabase/config";

/**
 * Setup check for whoever is deploying: which settings this deployment can see (yes/no only,
 * never the values) and whether the database answers. Visit /api/health after a deploy.
 */
export async function GET() {
  await connection();
  let env: ReturnType<typeof serverEnv>;
  try {
    env = serverEnv();
  } catch (err) {
    // A setting is present but malformed (for example a DATABASE_URL with brackets or spaces).
    return NextResponse.json(
      { problem: err instanceof Error ? err.message : "Invalid settings" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  const supabase = supabasePublicConfig();

  let database: string;
  if (!isDbConfigured()) {
    database = "missing: add DATABASE_URL";
  } else if (/\[|\]|YOUR-PASSWORD/i.test(env.DATABASE_URL ?? "")) {
    database =
      "DATABASE_URL still has [YOUR-PASSWORD] or square brackets in it: put your real password in, without brackets";
  } else {
    try {
      const rows = await getDb()
        .select({ n: count() })
        .from(projects)
        .where(eq(projects.status, "published"));
      database = `ok: ${rows[0]?.n ?? 0} published templates`;
    } catch (err) {
      // Error codes only: messages can include the host name.
      // Drizzle wraps the driver's error; the Postgres or network code is on `cause`.
      const inner = (err as { cause?: unknown }).cause ?? err;
      const code = String((inner as { code?: unknown }).code ?? "unknown");
      database =
        code === "42P01"
          ? "connected, but the REMAXX tables aren't there: run the setup SQL"
          : code === "28P01" || code === "XX000"
            ? `can't sign in (error ${code}): the password or user name in DATABASE_URL is wrong`
            : code === "ENOTFOUND" || code === "ENETUNREACH" || code === "EHOSTUNREACH"
              ? `can't reach the server (error ${code}): use the Transaction pooler string (port 6543), not the Direct connection`
              : `can't connect (error ${code}): check DATABASE_URL`;
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
      vibeSearch: await checkVibeSearch(),
      rateLimitStore: env.UPSTASH_REDIS_REST_URL ? "ok" : "in-memory (optional for now)",
      aiModels: aiModelsStatus(),
      aiAccess:
        aiAccessMode() === "admins" ? "admins only (AI_ACCESS=admins)" : "everyone signed in",
      payments: paymentsStatus(env),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function aiModelsStatus(): string {
  const on = [...configuredProviders()];
  const missing = (["anthropic", "openai", "google", "deepseek"] as const).filter(
    (p) => !on.includes(p),
  );
  if (!on.length) return "off: add at least one AI provider key (OPENAI_API_KEY to start)";
  return missing.length
    ? `ok: ${on.join(", ")} (not set up yet: ${missing.join(", ")})`
    : `ok: ${on.join(", ")}`;
}

function paymentsStatus(env: ReturnType<typeof serverEnv>): string {
  const mode = stripeMode();
  if (mode === "off") return "off: add STRIPE_SECRET_KEY (test key, sk_test_...) to sell plans";
  if (mode === "live-blocked")
    return "refused: STRIPE_SECRET_KEY is a live key; use a test key, or set STRIPE_ALLOW_LIVE=true when you're ready";
  if (!env.STRIPE_WEBHOOK_SECRET)
    return `${mode} mode, but STRIPE_WEBHOOK_SECRET is missing: credits won't arrive after checkout`;
  return `ok: ${mode} mode`;
}

/** Makes one real (tiny) embedding call so problems with the key or billing show up here. */
async function checkVibeSearch(): Promise<string> {
  const embedder = getEmbedder();
  if (!embedder) return "words only: add OPENAI_API_KEY to match by vibe";
  try {
    await embedQuery(embedder, `health check ${Date.now() % 1000}`);
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    if (/401|invalid_api_key/.test(msg))
      return `OpenAI rejected the key (${msg}): copy it again into OPENAI_API_KEY`;
    if (/insufficient_quota|billing|credit_balance|quota/.test(msg))
      return `OpenAI account has no credit (${msg}): add a balance at platform.openai.com → Billing`;
    if (/429/.test(msg)) return `OpenAI is rate limiting this key (${msg}): try again in a minute`;
    if (/404|model_not_found/.test(msg))
      return `This key can't use the embedding model (${msg}): check the project's model access`;
    return `OpenAI call failed (${msg})`;
  }
}
