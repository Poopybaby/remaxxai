/**
 * Prints the first-time setup SQL (see lib/db/setup-sql.ts).
 * Usage: pnpm db:setup-sql > setup.sql   then paste it into Supabase → SQL Editor → Run.
 */
import { buildSetupSql } from "../lib/db/setup-sql";

buildSetupSql()
  .then((sql) => process.stdout.write(sql))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
