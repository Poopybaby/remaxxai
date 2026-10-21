import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/** Minimal surface both postgres-js and PGlite can provide. */
export type MigrationExecutor = {
  /** Run one or more SQL statements with no parameters. */
  exec(sql: string): Promise<void>;
  /** Return the names of migrations already applied. */
  appliedNames(): Promise<string[]>;
  /** Run `fn` inside a transaction; the executor passed to `fn` is bound to that transaction. */
  transaction(fn: (tx: Pick<MigrationExecutor, "exec">) => Promise<void>): Promise<void>;
};

export async function listMigrationFiles(dir = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
}

/**
 * Applies every pending migration in filename order, each in its own transaction.
 * Returns the names it applied.
 */
export async function runMigrations(
  db: MigrationExecutor,
  dir = MIGRATIONS_DIR,
): Promise<string[]> {
  await db.exec(
    `create table if not exists schema_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const applied = new Set(await db.appliedNames());
  const pending = (await listMigrationFiles(dir)).filter((f) => !applied.has(f));

  for (const name of pending) {
    const sql = await readFile(path.join(dir, name), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.exec(`insert into schema_migrations (name) values ('${name.replace(/'/g, "''")}')`);
    });
  }
  return pending;
}
