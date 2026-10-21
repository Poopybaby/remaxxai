import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Driver-agnostic database handle. Production uses postgres-js, tests use PGlite;
 * business logic takes a `Db` so the same code runs against both.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
