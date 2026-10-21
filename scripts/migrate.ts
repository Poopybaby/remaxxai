/**
 * Applies pending SQL migrations from db/migrations to DATABASE_URL.
 * Usage: pnpm db:migrate
 */
import "./load-env";
import postgres from "postgres";
import { runMigrations, type MigrationExecutor } from "../lib/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }
  // Use the direct (session) connection for migrations, not the transaction pooler.
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  const executor: MigrationExecutor = {
    exec: async (text) => {
      await sql.unsafe(text);
    },
    appliedNames: async () => {
      const rows = await sql<{ name: string }[]>`select name from schema_migrations`;
      return rows.map((r) => r.name);
    },
    transaction: async (fn) => {
      await sql.begin(async (tx) => {
        await fn({
          exec: async (text) => {
            await tx.unsafe(text);
          },
        });
      });
    },
  };

  try {
    const applied = await runMigrations(executor);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
