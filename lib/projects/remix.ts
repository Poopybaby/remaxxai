/**
 * Remixing: copies a project's current files into a new private draft owned by the remixer,
 * with lineage and credit recorded. File bytes aren't duplicated (blobs are content-addressed).
 */
import { and, asc, count, eq } from "drizzle-orm";
import { isLicenseId, type LicenseId } from "@/config/licenses";
import { assert, canRemix, type Viewer } from "@/lib/auth/permissions";
import { blobs, projectFiles, projects, projectTags, tags, type Project } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { getAncestorLicenses } from "@/lib/licensing/chain";
import { defaultRemixLicense } from "@/lib/licensing/compat";
import { isStyleId, type StyleId } from "@/config/taxonomy";
import { typeFor } from "@/lib/upload/mime";
import { createProject } from "./create";
import { PROJECT_TEXT_LIMITS } from "@/config/limits";

/** Drafts a person may have at once, so remixing can't be used to fill the database. */
export const MAX_DRAFTS_PER_USER = 50;

export class RemixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemixError";
  }
}

export function remixTitle(title: string): string {
  const suffix = " remix";
  const base = title.endsWith(suffix) ? title : `${title}${suffix}`;
  if (base.length <= PROJECT_TEXT_LIMITS.titleMax) return base;
  return `${title.slice(0, PROJECT_TEXT_LIMITS.titleMax - suffix.length).trimEnd()}${suffix}`;
}

export async function createRemix(db: Db, viewer: Viewer, sourceId: string): Promise<Project> {
  const [source] = await db.select().from(projects).where(eq(projects.id, sourceId));
  if (!source) throw new RemixError("That project doesn't exist.");
  assert(canRemix(viewer, source), "You can't remix this project.");
  if (!source.currentVersionId) throw new RemixError("That project has no files to remix.");
  const ownerId = viewer!.userId;

  const [drafts] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), eq(projects.status, "draft")));
  if ((drafts?.n ?? 0) >= MAX_DRAFTS_PER_USER) {
    throw new RemixError(
      `You have ${MAX_DRAFTS_PER_USER} drafts. Delete or publish some before remixing more.`,
    );
  }

  const fileRows = await db
    .select({ path: projectFiles.path, mime: projectFiles.mime, content: blobs.content })
    .from(projectFiles)
    .innerJoin(blobs, eq(blobs.sha256, projectFiles.blobSha256))
    .where(eq(projectFiles.versionId, source.currentVersionId))
    .orderBy(asc(projectFiles.path));
  if (fileRows.length === 0 || fileRows.some((f) => !f.content)) {
    throw new RemixError("That project's files couldn't be loaded.");
  }

  const tagRows = await db
    .select({ slug: tags.slug, kind: tags.kind })
    .from(projectTags)
    .innerJoin(tags, eq(tags.id, projectTags.tagId))
    .where(eq(projectTags.projectId, source.id));
  const styles = tagRows
    .filter((t) => t.kind === "style" && isStyleId(t.slug))
    .map((t) => t.slug as StyleId)
    .slice(0, 4);
  const topics = tagRows.filter((t) => t.kind === "topic").map((t) => t.slug);

  // The remix inherits the licenses of its whole chain: the source's own, then its ancestors'.
  const sourceLicense: LicenseId = isLicenseId(source.licenseId)
    ? source.licenseId
    : "remaxx-personal";
  const chain = [sourceLicense, ...(await getAncestorLicenses(db, source.id))];

  return createProject(db, {
    ownerId,
    metadata: {
      title: remixTitle(source.title),
      description: source.description,
      category: source.category as never,
      toolUsed: "remaxx",
      licenseId: defaultRemixLicense(chain),
      styles,
      tags: topics,
      rightsConfirmed: true,
    },
    files: fileRows.map((f) => ({
      path: f.path,
      bytes: f.content!,
      mime: f.mime,
      isText: typeFor(f.path)?.text ?? false,
    })),
    entryPath: source.entryPath,
    coverUrl: source.coverUrl,
    status: "draft",
    statusReason: null,
    parentProjectId: source.id,
    createdBy: "system",
  });
}
