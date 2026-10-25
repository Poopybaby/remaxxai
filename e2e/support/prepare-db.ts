/**
 * Prepares an empty Postgres for the browser smoke tests: the Supabase pieces our SQL expects,
 * the same setup SQL people paste into Supabase, the starter gallery, and two test accounts.
 * Usage: DATABASE_URL=postgres://... pnpm e2e:db   (refuses anything that isn't local)
 */
import postgres from "postgres";
import { buildSetupSql } from "@/lib/db/setup-sql";
import { buildSeedSql } from "@/lib/seed/build-sql";
import { E2E_USERS } from "./users";

const SUPABASE_STUB = `
  create extension if not exists pgcrypto;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL");
  // Never touch a real database: the smoke tests create accounts and data.
  if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
    throw new Error("prepare-db only runs against a local database");
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(SUPABASE_STUB);
    await sql.unsafe(await buildSetupSql());
    await sql.unsafe(await buildSeedSql());
    for (const u of Object.values(E2E_USERS)) {
      await sql`insert into auth.users (id, email) values (${u.id}, ${u.email}) on conflict do nothing`;
      await sql`
        insert into profiles (id, handle, display_name, role, age_confirmed_at)
        values (${u.id}, ${u.handle}, ${u.displayName}, ${u.role}, now())
        on conflict (id) do nothing`;
    }
    // Credits for the admin, so the AI steps can run (and re-run) after the free prompts are used.
    // A normal ledger entry, keyed so running this again doesn't add more.
    await sql`
      with grant_row as (
        insert into credit_ledger (user_id, delta, kind, idempotency_key, meta)
        values (${E2E_USERS.admin.id}, 1000, 'admin_adjust', 'e2e-grant', '{"note":"smoke tests"}')
        on conflict (idempotency_key) do nothing
        returning user_id, delta
      )
      update credit_accounts c set balance = c.balance + g.delta
      from grant_row g where c.user_id = g.user_id`;
    const [n] = await sql`select count(*)::int as n from projects where status = 'published'`;
    console.log(`database ready: ${n?.n} published templates`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
