/**
 * Typed mirror of db/migrations/*.sql. The SQL migrations are the source of truth;
 * tests/integration/schema.test.ts fails if this file and the migrated database drift apart.
 */
import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  websiteUrl: text("website_url"),
  role: userRole("role").notNull().default("user"),
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    document: text("document", { enum: ["terms", "acceptable_use", "privacy"] }).notNull(),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.document, t.version)],
);

export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("landing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
