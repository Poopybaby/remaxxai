/**
 * Typed mirror of db/migrations/*.sql. The SQL migrations are the source of truth;
 * tests/integration/schema.test.ts fails if this file and the migrated database drift apart.
 */
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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

// ── Phase 2: gallery ─────────────────────────────────────────────────────────

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => new Uint8Array(value),
});

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const licenses = pgTable("licenses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  spdxId: text("spdx_id"),
  url: text("url").notNull(),
  commercialUse: boolean("commercial_use").notNull(),
  attributionRequired: boolean("attribution_required").notNull(),
  shareAlike: boolean("share_alike").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const blobs = pgTable("blobs", {
  sha256: text("sha256").primaryKey(),
  size: integer("size").notNull(),
  content: bytea("content"),
  storageKey: text("storage_key"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const projectStatus = pgEnum("project_status", [
  "draft",
  "pending_review",
  "published",
  "unpublished",
  "removed",
  "hidden_pending_review",
]);
export type ProjectStatus = (typeof projectStatus.enumValues)[number];

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  projectType: text("project_type", { enum: ["static", "react"] })
    .notNull()
    .default("static"),
  category: text("category").notNull(),
  toolUsed: text("tool_used").notNull(),
  licenseId: text("license_id")
    .notNull()
    .references(() => licenses.id),
  status: projectStatus("status").notNull().default("published"),
  statusReason: text("status_reason"),
  coverUrl: text("cover_url"),
  entryPath: text("entry_path").notNull().default("index.html"),
  currentVersionId: uuid("current_version_id"),
  parentProjectId: uuid("parent_project_id"),
  parentVersionId: uuid("parent_version_id"),
  rootProjectId: uuid("root_project_id"),
  likeCount: integer("like_count").notNull().default(0),
  saveCount: integer("save_count").notNull().default(0),
  remixCount: integer("remix_count").notNull().default(0),
  isStaffPick: boolean("is_staff_pick").notNull().default(false),
  publishedAt: ts("published_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
export type Project = typeof projects.$inferSelect;

export const projectVersions = pgTable("project_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  message: text("message").notNull().default(""),
  createdBy: text("created_by", { enum: ["user", "ai", "system"] })
    .notNull()
    .default("user"),
  fileCount: integer("file_count").notNull(),
  totalBytes: integer("total_bytes").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const projectFiles = pgTable(
  "project_files",
  {
    versionId: uuid("version_id")
      .notNull()
      .references(() => projectVersions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    blobSha256: text("blob_sha256")
      .notNull()
      .references(() => blobs.sha256),
    size: integer("size").notNull(),
    mime: text("mime").notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.path] })],
);

export const remixLineage = pgTable(
  "remix_lineage",
  {
    ancestorId: uuid("ancestor_id").notNull(),
    descendantId: uuid("descendant_id").notNull(),
    depth: integer("depth").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ancestorId, t.descendantId] })],
);

export const lineageCredits = pgTable(
  "lineage_credits",
  {
    projectId: uuid("project_id").notNull(),
    position: integer("position").notNull(),
    ancestorProjectId: uuid("ancestor_project_id"),
    ancestorTitle: text("ancestor_title").notNull(),
    ancestorSlug: text("ancestor_slug").notNull(),
    ancestorOwnerHandle: text("ancestor_owner_handle").notNull(),
    ancestorLicenseId: text("ancestor_license_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.position] })],
);

export const rightsAttestations = pgTable("rights_attestations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  userId: uuid("user_id").notNull(),
  licenseId: text("license_id").notNull(),
  statementVersion: text("statement_version").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: ["style", "topic"] })
    .notNull()
    .default("topic"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const projectTags = pgTable(
  "project_tags",
  {
    projectId: uuid("project_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.tagId] })],
);

export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id").notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  visibility: text("visibility", { enum: ["private", "public"] })
    .notNull()
    .default("private"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid("collection_id").notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.projectId] })],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id").notNull(),
    followeeId: uuid("followee_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })],
);

export const REPORT_REASONS = [
  "copyright",
  "leaked_code",
  "malware",
  "phishing",
  "sexual",
  "hate",
  "harassment",
  "spam",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const reportStatus = pgEnum("report_status", ["open", "actioned", "dismissed"]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id"),
  targetProjectId: uuid("target_project_id"),
  targetProfileId: uuid("target_profile_id"),
  reason: text("reason", { enum: REPORT_REASONS }).notNull(),
  details: text("details").notNull().default(""),
  isDmca: boolean("is_dmca").notNull().default(false),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  status: reportStatus("status").notNull().default("open"),
  resolvedBy: uuid("resolved_by"),
  resolutionNote: text("resolution_note"),
  resolvedAt: ts("resolved_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const moderationEvents = pgTable("moderation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: text("subject_type", { enum: ["project", "profile", "prompt"] }).notNull(),
  subjectId: uuid("subject_id"),
  source: text("source", { enum: ["scanner", "openai", "admin", "skipped"] }).notNull(),
  verdict: text("verdict", { enum: ["pass", "flag", "block"] }).notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  detail: jsonb("detail").notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});
