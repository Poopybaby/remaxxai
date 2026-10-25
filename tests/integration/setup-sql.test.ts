import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterEach, describe, expect, it } from "vitest";
import { buildSetupSql } from "@/lib/db/setup-sql";
import { buildSeedSql } from "@/lib/seed/build-sql";

// Enough of Supabase for the setup script: auth.users, storage.buckets and the API roles.
const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
`;

// What a Supabase starter template leaves behind (matches a real project we set up).
const STARTER_TEMPLATE = `
  create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text,
    created_at timestamptz default now()
  );
  create table public.tasks (
    id bigint generated always as identity primary key,
    user_id uuid references public.profiles (id),
    title text,
    updated_at timestamptz default now()
  );
  create function public.set_updated_at() returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end; $$;
  create trigger tasks_set_updated_at before update on public.tasks
    for each row execute function public.set_updated_at();
  create function public.handle_new_user() returns trigger language plpgsql as $$
  begin insert into public.profiles (id) values (new.id); return new; end; $$;
  create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
`;

let pg: PGlite | undefined;
afterEach(async () => {
  await pg?.close();
  pg = undefined;
});

async function freshDb(extra = ""): Promise<PGlite> {
  pg = new PGlite({ extensions: { vector } });
  await pg.exec(SUPABASE_STUB + extra);
  return pg;
}

describe("first-time setup SQL", () => {
  it("sets up a starter-template project without touching its own tables", async () => {
    const db = await freshDb(STARTER_TEMPLATE);
    const setup = await buildSetupSql();
    await db.exec(setup);
    await db.exec(setup); // pasted twice by mistake: still fine

    const applied = await db.query<{ name: string }>("select name from schema_migrations");
    expect(applied.rows.map((r) => r.name)).toEqual([
      "0001_foundation.sql",
      "0002_gallery.sql",
      "0003_vibe_search.sql",
      "0004_editor.sql",
    ]);

    // Old table kept under a new name; tasks still works with its own set_updated_at.
    await db.query("select * from profiles_legacy");
    await db.exec(`insert into tasks (title) values ('a'); update tasks set title = 'b';`);

    // A sign-up no longer fails on the old trigger.
    await db.exec(`insert into auth.users (email) values ('new@example.com')`);

    const seed = await buildSeedSql();
    await db.exec(seed);
    await db.exec(seed);
    const n = await db.query<{ n: number }>(
      "select count(*)::int as n from projects where status = 'published'",
    );
    expect(n.rows[0]?.n).toBe(29);
  });

  it("upgrades a project that already ran the Phase 2 setup, keeping its data", async () => {
    const db = await freshDb(STARTER_TEMPLATE);
    // Phase 2's setup: the same script, minus the newer migrations.
    const phase2 = (await buildSetupSql()).replace(
      /-- 0003_vibe_search\.sql[\s\S]*?-- 0004_editor\.sql[\s\S]*?\$setup\$;\n/,
      "",
    );
    expect(phase2).not.toContain("create table project_search");
    await db.exec(phase2);
    await db.exec(await buildSeedSql());

    await db.exec(await buildSetupSql());
    await db.exec(await buildSeedSql());
    const applied = await db.query<{ name: string }>(
      "select name from schema_migrations order by name",
    );
    expect(applied.rows.map((r) => r.name)).toContain("0003_vibe_search.sql");
    const counts = await db.query<{ projects: number; indexed: number }>(
      "select (select count(*)::int from projects) as projects, (select count(*)::int from project_search) as indexed",
    );
    expect(counts.rows[0]).toEqual({ projects: 29, indexed: 29 });
  });

  it("works on a brand-new project", async () => {
    const db = await freshDb();
    await db.exec(await buildSetupSql());
    const buckets = await db.query("select id from storage.buckets");
    expect(buckets.rows.length).toBeGreaterThan(0);
  });

  it("lists every name clash at once and changes nothing", async () => {
    const db = await freshDb(`
      create table public.tags (id int);
      create type public.project_status as enum ('x');
    `);
    await expect(db.exec(await buildSetupSql())).rejects.toThrow(
      /table tags.*type project_status|type project_status.*table tags/,
    );
    expect(await db.query("select to_regclass('public.waitlist') as t")).toMatchObject({
      rows: [{ t: null }],
    });
  });
});
