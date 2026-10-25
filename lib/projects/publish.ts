/**
 * Publishing a draft remix to the gallery. Runs every check an upload gets (file scanner,
 * moderation of the text and cover) plus the remix rules: the license must be one the whole
 * credit chain allows. Credit to the original makers was recorded when the remix was made and
 * shows on the published page automatically.
 */
import { and, eq } from "drizzle-orm";
import { LICENSES, type LicenseId } from "@/config/licenses";
import { assert, canOpenInEditor, type Viewer } from "@/lib/auth/permissions";
import {
  blobs,
  moderationEvents,
  projects,
  projectTags,
  rightsAttestations,
  type ProjectStatus,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { getAncestorLicenses } from "@/lib/licensing/chain";
import { allowedRemixLicenses, canPublishRemixAs } from "@/lib/licensing/compat";
import type { ModerationVerdict } from "@/lib/moderation";
import { isUniqueViolation } from "@/lib/profiles";
import { sha256Hex } from "@/lib/storage/keys";
import { detectCoverType } from "@/lib/upload/mime";
import { scanFiles } from "@/lib/upload/scan";
import { attachTags } from "./create";
import { projectMetadataSchema, uniqueSlug } from "./metadata";
import { loadEditorFiles } from "./versions";

/** What someone confirms when publishing a remix. Bump the version when the wording changes. */
export const REMIX_RIGHTS_STATEMENT_VERSION = "remix-2026-10-25";
export const REMIX_RIGHTS_STATEMENT =
  "My changes are my own, I added nothing I don't have the rights to, and I'm sharing this remix under a license the original allows.";

export class PublishError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export type PublishInput = {
  /** Unchecked details from the form; validated here. */
  metadata: unknown;
  /** A new cover image, or null to keep the current one. */
  cover: Uint8Array | null;
};

export type PublishResult = {
  slug: string;
  status: Extract<ProjectStatus, "published" | "pending_review">;
};

export async function licensesForDraft(db: Db, projectId: string): Promise<LicenseId[]> {
  return allowedRemixLicenses(await getAncestorLicenses(db, projectId));
}

export async function publishDraft(
  db: Db,
  viewer: Viewer,
  projectId: string,
  input: PublishInput,
  deps: {
    moderate: (input: { texts?: string[]; imageDataUrls?: string[] }) => Promise<ModerationVerdict>;
  },
): Promise<PublishResult> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new PublishError("That draft doesn't exist.");
  assert(canOpenInEditor(viewer, project), "Only the owner can publish this draft.");
  if (!project.currentVersionId) throw new PublishError("This draft has no files.");

  const parsed = projectMetadataSchema.safeParse(input.metadata);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PublishError(issue?.message ?? "Check the details.", String(issue?.path[0] ?? ""));
  }
  const meta = parsed.data;

  // The license has to work for every project this remix is built on.
  const chain = await getAncestorLicenses(db, projectId);
  if (!canPublishRemixAs(chain, meta.licenseId)) {
    const allowed = allowedRemixLicenses(chain).map((id) => LICENSES[id].shortName);
    throw new PublishError(
      `This remix can only be shared as ${allowed.join(" or ")}.`,
      "licenseId",
    );
  }

  // The same checks an upload gets.
  const files = await loadEditorFiles(db, project.currentVersionId);
  const enc = new TextEncoder();
  const scan = scanFiles(
    files
      .filter((f) => f.text !== null)
      .map((f) => ({ path: f.path, bytes: enc.encode(f.text!), mime: f.mime, isText: true })),
  );
  if (scan.blocking.length) {
    throw new PublishError(scan.blocking.map((b) => `${b.path}: ${b.message}`).join(" "));
  }

  let coverUrl = project.coverUrl;
  let coverDataUrl: string | null = null;
  if (input.cover) {
    const type = detectCoverType(input.cover);
    if (!type) throw new PublishError("Use a PNG, JPG, WebP or GIF for the cover.", "cover");
    if (input.cover.byteLength > 2 * 1024 * 1024)
      throw new PublishError("Keep the cover under 2 MB.", "cover");
    const sha = await sha256Hex(input.cover);
    await db
      .insert(blobs)
      .values({ sha256: sha, size: input.cover.byteLength, content: input.cover })
      .onConflictDoNothing();
    coverUrl = `/media/${sha}.${type.ext}`;
    coverDataUrl = `data:${type.mime};base64,${Buffer.from(input.cover).toString("base64")}`;
  }

  const verdict = await deps.moderate({
    texts: [meta.title, meta.description, ...meta.tags],
    imageDataUrls: coverDataUrl ? [coverDataUrl] : [],
  });
  if (verdict.verdict === "block") {
    throw new PublishError("This can't be published here. Check the Acceptable Use Policy.");
  }
  const held = scan.flags.length > 0 || verdict.verdict === "flag";
  const status = held ? "pending_review" : "published";

  const keepSlug = meta.title === project.title;
  for (let attempt = 0; ; attempt++) {
    const slug = keepSlug ? project.slug : uniqueSlug(meta.title);
    try {
      await writePublish(slug);
      return { slug, status };
    } catch (err) {
      // A random slug suffix clashing is rare; just pick another.
      if (!keepSlug && isUniqueViolation(err) && attempt < 2) continue;
      throw err;
    }
  }

  async function writePublish(slug: string) {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(projects)
        .set({
          slug,
          title: meta.title,
          description: meta.description,
          category: meta.category,
          licenseId: meta.licenseId,
          coverUrl,
          status,
          statusReason: held ? "Held for a quick review before it goes public." : null,
          publishedAt: new Date(),
        })
        .where(and(eq(projects.id, projectId), eq(projects.status, "draft")))
        .returning({ id: projects.id });
      if (updated.length === 0) throw new PublishError("This draft was already published.");

      await tx.delete(projectTags).where(eq(projectTags.projectId, projectId));
      await attachTags(tx, projectId, meta.styles, meta.tags);
      await tx.insert(rightsAttestations).values({
        projectId,
        userId: viewer!.userId,
        licenseId: meta.licenseId,
        statementVersion: REMIX_RIGHTS_STATEMENT_VERSION,
      });
      const events = [];
      if (scan.flags.length) {
        events.push({
          subjectType: "project" as const,
          subjectId: projectId,
          source: "scanner" as const,
          verdict: "flag" as const,
          detail: { findings: scan.flags },
        });
      }
      events.push({
        subjectType: "project" as const,
        subjectId: projectId,
        source: verdict.source,
        verdict: verdict.verdict === "skipped" ? ("pass" as const) : verdict.verdict,
        detail: { categories: verdict.categories, on: "publish" },
      });
      await tx.insert(moderationEvents).values(events);
    });
  }
}
