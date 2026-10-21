import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const tables: PgTable[] = (Object.values(schema) as unknown[]).filter((v): v is PgTable =>
  is(v, PgTable),
);

describe("drizzle schema matches the migrated database", () => {
  it("covers at least one table", () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it.each(tables.map((table) => [getTableName(table), table] as const))(
    "%s",
    async (name, table) => {
      const res = await t.pg.query<{ column_name: string; is_nullable: "YES" | "NO" }>(
        `select column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = $1`,
        [name],
      );
      const dbColumns = new Map(res.rows.map((r) => [r.column_name, r.is_nullable === "YES"]));
      expect(dbColumns.size, `table ${name} missing from database`).toBeGreaterThan(0);

      const codeColumns = Object.values(getTableColumns(table));
      expect(codeColumns.map((c) => c.name).sort()).toEqual([...dbColumns.keys()].sort());
      for (const col of codeColumns) {
        expect(!col.notNull, `${name}.${col.name} nullability`).toBe(dbColumns.get(col.name));
      }
    },
  );
});
