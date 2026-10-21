import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { MissingConfigError, serverEnv } from "@/lib/env";
import * as schema from "./schema";
import type { Db } from "./types";

let instance: Db | undefined;

export function isDbConfigured(): boolean {
  return Boolean(serverEnv().DATABASE_URL);
}

/**
 * Server-side database handle (connects as the database owner, so RLS is bypassed:
 * every caller must run its own permission check first).
 */
export function getDb(): Db {
  if (instance) return instance;
  const url = serverEnv().DATABASE_URL;
  if (!url) throw new MissingConfigError("Database", ["DATABASE_URL"]);
  // `prepare: false` is required behind Supabase's transaction-mode pooler (port 6543).
  const client = postgres(url, { prepare: false, max: 5 });
  instance = drizzle({ client, schema });
  return instance;
}
