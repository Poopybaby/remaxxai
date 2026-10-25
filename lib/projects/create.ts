/**
 * Creates a project from validated files and metadata. Everything happens in one transaction:
 * either the project, its first version, files, tags and rights record all exist, or none do.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { isStyleId } from "@/config/taxonomy";
import {
  blobs,
  moderationEvents,
  projectFiles,
  projects,
  projectTags,
  projectVersions,
  rightsAttestations,
  tags,
  type Project,
  type ProjectStatus,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { recordLineage } from "@/lib/licensing/chain";
import { isUniqueViolation } from "@/lib/profiles";
import { sha256Hex } from "@/lib/storage/keys";
import type { ScanFinding, UploadFile } from "@/lib/upload/types";
import { RIGHTS_STATEMENT_VERSION, uniqueSlug, type ProjectMetadata } from "./metadata";

export type CreateProjectInput = {
  ownerId: string;
  metadata: ProjectMetadata;
  files: UploadFile[];
  entryPath: string;
  coverUrl: string | null;
  status: Extract<ProjectStatus, "published" | "pending_review" | "draft">;
  statusReason?: string | null;
  /** Remix parent, if any. Lineage and credits are recorded in the same transaction. */
  parentProjectId?: string | null;
  createdBy?: "user" | "ai" | "system";
  findings?: ScanFinding[];
  moderation?: {
    source: "openai" | "skipped";
    verdict: "pass" | "flag" | "block";
    categories: string[];
  } | null;
  /** Fixed values for seeding and tests. */
  id?: string;
  slug?: string;
  publishedAt?: Date;
};

export async function createProject(db: Db, input: CreateProjectInput): Promise<Project> {
  const hashed = await Promise.all(
    input.files.map(async (f) => ({ ...f, sha256: await sha256Hex(f.bytes) })),
  );
  const totalBytes = hashed.reduce((s, f) => s + f.bytes.byteLength, 0);

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = input.slug ?? uniqueSlug(input.metadata.title);
    try {
      return await db.transaction(async (tx) => {
        // Content-addressed: identical bytes are stored once, across all projects.
        await tx
          .insert(blobs)
          .values(
            hashed.map((f) => ({ sha256: f.sha256, size: f.bytes.byteLength, content: f.bytes })),
          )
          .onConflictDoNothing({ target: blobs.sha256 });

        const parent = input.parentProjectId
          ? (
              await tx
                .select({
                  id: projects.id,
                  rootProjectId: projects.rootProjectId,
                  versionId: projects.currentVersionId,
                })
                .from(projects)
                .where(eq(projects.id, input.parentProjectId))
            )[0]
          : undefined;
        if (input.parentProjectId && !parent) throw new Error("Parent project not found");

        const now = input.publishedAt ?? new Date();
        const [project] = await tx
          .insert(projects)
          .values({
            ...(input.id ? { id: input.id } : {}),
            ownerId: input.ownerId,
            slug,
            title: input.metadata.title,
            description: input.metadata.description,
            category: input.metadata.category,
            toolUsed: input.metadata.toolUsed,
            licenseId: input.metadata.licenseId,
            status: input.status,
            statusReason: input.statusReason ?? null,
            coverUrl: input.coverUrl,
            entryPath: input.entryPath,
            parentProjectId: parent?.id ?? null,
            parentVersionId: parent?.versionId ?? null,
            rootProjectId: parent ? (parent.rootProjectId ?? parent.id) : null,
            publishedAt: input.status === "published" ? now : null,
            createdAt: now,
          })
          .returning();
        if (!project) throw new Error("Project insert returned no row");

        const [version] = await tx
          .insert(projectVersions)
          .values({
            projectId: project.id,
            number: 1,
            message: parent ? "Remixed" : "First upload",
            createdBy: input.createdBy ?? "user",
            fileCount: hashed.length,
            totalBytes,
            createdAt: now,
          })
          .returning();
        if (!version) throw new Error("Version insert returned no row");

        await tx.insert(projectFiles).values(
          hashed.map((f) => ({
            versionId: version.id,
            path: f.path,
            blobSha256: f.sha256,
            size: f.bytes.byteLength,
            mime: f.mime,
          })),
        );

        const [updated] = await tx
          .update(projects)
          .set({ currentVersionId: version.id })
          .where(eq(projects.id, project.id))
          .returning();

        await attachTags(tx, project.id, input.metadata.styles, input.metadata.tags);

        if (parent) await recordLineage(tx, project.id, parent.id);

        await tx.insert(rightsAttestations).values({
          projectId: project.id,
          userId: input.ownerId,
          licenseId: input.metadata.licenseId,
          statementVersion: RIGHTS_STATEMENT_VERSION,
        });

        const events = [];
        if (input.findings?.length) {
          events.push({
            subjectType: "project" as const,
            subjectId: project.id,
            source: "scanner" as const,
            verdict: "flag" as const,
            detail: { findings: input.findings },
          });
        }
        if (input.moderation) {
          events.push({
            subjectType: "project" as const,
            subjectId: project.id,
            source: input.moderation.source,
            verdict: input.moderation.verdict,
            detail: { categories: input.moderation.categories },
          });
        }
        if (events.length) await tx.insert(moderationEvents).values(events);

        return updated ?? project;
      });
    } catch (err) {
      // A slug collision is the only conflict worth retrying; anything else is a real error.
      if (!input.slug && isUniqueViolation(err) && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error("Couldn't create a unique link for this project");
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function attachTags(tx: Tx, projectId: string, styles: string[], topics: string[]) {
  const wanted = [
    ...styles.map((slug) => ({ slug, kind: "style" as const })),
    ...topics
      .filter((t) => !styles.includes(t))
      .map((slug) => ({ slug, kind: isStyleId(slug) ? ("style" as const) : ("topic" as const) })),
  ];
  if (wanted.length === 0) return;
  await tx
    .insert(tags)
    .values(wanted)
    .onConflictDoUpdate({ target: tags.slug, set: { slug: sql`excluded.slug` } });
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(
      inArray(
        tags.slug,
        wanted.map((w) => w.slug),
      ),
    );
  await tx
    .insert(projectTags)
    .values(rows.map((r) => ({ projectId, tagId: r.id })))
    .onConflictDoNothing();
}
