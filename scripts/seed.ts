/**
 * Loads the 29 starter templates into the gallery.
 *
 *   pnpm seed               apply directly to DATABASE_URL
 *   pnpm seed:sql > s.sql   print the SQL instead, to paste into Supabase → SQL Editor
 *
 * Safe to run repeatedly: existing rows are left alone.
 */
import "./load-env";
import postgres from "postgres";
import { buildSeedSql } from "../lib/seed/build-sql";

async function main() {
  const sql = await buildSeedSql();
  if (process.argv.includes("--sql")) {
    process.stdout.write(sql);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Use `pnpm seed:sql` to get SQL to paste into Supabase instead.",
    );
    process.exit(1);
  }
  const db = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await db.unsafe(sql);
    const [row] = await db<
      { n: number }[]
    >`select count(*)::int as n from projects where status = 'published'`;
    console.log(`Seed applied. Published projects in the gallery: ${row?.n ?? 0}.`);
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
