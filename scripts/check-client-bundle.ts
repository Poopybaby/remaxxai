/**
 * Fails if anything that looks like a server secret ended up in the browser bundle.
 * Runs after `next build` in CI. Usage: pnpm check:bundle
 */
import "./load-env";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");

// Key formats for the providers REMAXX uses. Publishable keys are allowed in the browser.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  {
    name: "Supabase service_role JWT",
    re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\./,
  },
  { name: "Anthropic key", re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { name: "OpenAI key", re: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: "Stripe secret key", re: /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/ },
  { name: "Stripe webhook secret", re: /whsec_[A-Za-z0-9]{10,}/ },
  { name: "Postgres URL with password", re: /postgres(?:ql)?:\/\/[^:\s"'`]+:[^@\s"'`]+@/ },
];

// Also look for the literal values of server-only env vars, if they're set in this environment.
const SERVER_ONLY_VARS = [
  "DATABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DEEPSEEK_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
];

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs|css|json|html|map)$/.test(entry.name)) yield full;
  }
}

async function main() {
  try {
    await stat(STATIC_DIR);
  } catch {
    console.error("No .next/static directory. Run `pnpm build` first.");
    process.exit(1);
  }

  const literals = SERVER_ONLY_VARS.map((name) => ({ name, value: process.env[name] })).filter(
    (v): v is { name: string; value: string } => Boolean(v.value && v.value.length >= 12),
  );

  const findings: string[] = [];
  let files = 0;
  for await (const file of walk(STATIC_DIR)) {
    files++;
    const text = await readFile(file, "utf8");
    for (const { name, re } of PATTERNS)
      if (re.test(text)) findings.push(`${name} in ${path.relative(process.cwd(), file)}`);
    for (const { name, value } of literals) {
      if (text.includes(value))
        findings.push(`value of ${name} in ${path.relative(process.cwd(), file)}`);
    }
  }

  if (findings.length) {
    console.error(
      "Possible secrets in the client bundle:\n" + findings.map((f) => `  - ${f}`).join("\n"),
    );
    process.exit(1);
  }
  console.log(`Client bundle clean (${files} files scanned).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
