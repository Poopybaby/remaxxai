import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import { runMigrations, type MigrationExecutor } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/types";

/**
 * Minimal stand-in for the parts of Supabase our migrations reference: the auth.users table
 * and the browser-facing roles. Real Supabase provides these.
 */
const SUPABASE_STUB = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
`;

export type TestDb = { pg: PGlite; db: Db; close: () => Promise<void> };

/** A fresh in-process Postgres with every migration applied. */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);

  const executor: MigrationExecutor = {
    exec: async (sql) => {
      await pg.exec(sql);
    },
    appliedNames: async () => {
      const res = await pg.query<{ name: string }>("select name from schema_migrations");
      return res.rows.map((r) => r.name);
    },
    transaction: async (fn) => {
      await pg.transaction(async (tx) => {
        await fn({
          exec: async (sql) => {
            await tx.exec(sql);
          },
        });
      });
    },
  };
  await runMigrations(executor);

  const db = drizzle({ client: pg, schema }) as unknown as Db;
  return { pg, db, close: () => pg.close() };
}

/** Inserts a row into the stub auth.users table and returns its id. */
export async function createAuthUser(
  pg: PGlite,
  email = `user-${crypto.randomUUID()}@example.com`,
): Promise<string> {
  const res = await pg.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error("failed to create auth user");
  return id;
}
