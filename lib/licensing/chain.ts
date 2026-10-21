/**
 * Remix lineage and the credit chain ("Remixed from X by Y"). Takes a `Db` (or transaction) so
 * it runs against Postgres and PGlite alike.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { isLicenseId, type LicenseId } from "@/config/licenses";
import { lineageCredits, profiles, projects, remixLineage } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

/** Anything with the query surface of a Db: the Db itself or a transaction. */
export type DbLike = Pick<Db, "select" | "insert" | "update" | "delete" | "execute">;

export type Credit = {
  position: number;
  title: string;
  slug: string;
  ownerHandle: string;
  licenseId: LicenseId;
  /** False when the ancestor was deleted or is no longer public (removed, unpublished...). */
  available: boolean;
  removed: boolean;
};

/**
 * Records that `childId` is a remix of `parentId`: closure rows for every ancestor and a credit
 * snapshot copied from the parent, so credit survives later renames and takedowns.
 * Call inside the same transaction that creates the child project.
 */
export async function recordLineage(db: DbLike, childId: string, parentId: string): Promise<void> {
  if (childId === parentId) throw new Error("A project can't be a remix of itself");

  const [parent] = await db
    .select({
      id: projects.id,
      title: projects.title,
      slug: projects.slug,
      licenseId: projects.licenseId,
      handle: profiles.handle,
    })
    .from(projects)
    .innerJoin(profiles, eq(profiles.id, projects.ownerId))
    .where(eq(projects.id, parentId));
  if (!parent) throw new Error("Parent project not found");

  const parentAncestors = await db
    .select()
    .from(remixLineage)
    .where(eq(remixLineage.descendantId, parentId));
  if (parentAncestors.some((a) => a.ancestorId === childId)) {
    throw new Error("Remix cycle detected");
  }

  await db
    .insert(remixLineage)
    .values([
      { ancestorId: parentId, descendantId: childId, depth: 1 },
      ...parentAncestors.map((a) => ({
        ancestorId: a.ancestorId,
        descendantId: childId,
        depth: a.depth + 1,
      })),
    ]);

  const parentCredits = await db
    .select()
    .from(lineageCredits)
    .where(eq(lineageCredits.projectId, parentId))
    .orderBy(asc(lineageCredits.position));

  await db.insert(lineageCredits).values([
    {
      projectId: childId,
      position: 1,
      ancestorProjectId: parent.id,
      ancestorTitle: parent.title,
      ancestorSlug: parent.slug,
      ancestorOwnerHandle: parent.handle,
      ancestorLicenseId: parent.licenseId,
    },
    ...parentCredits.map((c) => ({ ...c, projectId: childId, position: c.position + 1 })),
  ]);
}

/** The credit chain for a project, nearest ancestor first, with each ancestor's current state. */
export async function getCreditChain(db: DbLike, projectId: string): Promise<Credit[]> {
  const rows = await db
    .select()
    .from(lineageCredits)
    .where(eq(lineageCredits.projectId, projectId))
    .orderBy(asc(lineageCredits.position));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.ancestorProjectId).filter((id): id is string => Boolean(id));
  const live = ids.length
    ? await db
        .select({ id: projects.id, status: projects.status, slug: projects.slug })
        .from(projects)
        .where(inArray(projects.id, ids))
    : [];
  const byId = new Map(live.map((p) => [p.id, p]));

  return rows.map((r) => {
    const current = r.ancestorProjectId ? byId.get(r.ancestorProjectId) : undefined;
    return {
      position: r.position,
      title: r.ancestorTitle,
      slug: current?.slug ?? r.ancestorSlug,
      ownerHandle: r.ancestorOwnerHandle,
      licenseId: isLicenseId(r.ancestorLicenseId) ? r.ancestorLicenseId : "remaxx-personal",
      available: current?.status === "published",
      removed: !current || current.status === "removed",
    };
  });
}

/** Licenses of every ancestor, nearest first. Feeds allowedRemixLicenses(). */
export async function getAncestorLicenses(db: DbLike, projectId: string): Promise<LicenseId[]> {
  const chain = await getCreditChain(db, projectId);
  return chain.map((c) => c.licenseId);
}

/** Every project remixed (at any depth) from `projectId`. */
export async function getDescendantIds(db: DbLike, projectId: string): Promise<string[]> {
  const rows = await db
    .select({ id: remixLineage.descendantId })
    .from(remixLineage)
    .where(eq(remixLineage.ancestorId, projectId));
  return rows.map((r) => r.id);
}
