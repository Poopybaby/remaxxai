/** Likes, saves and follows. Counters are maintained by database triggers. */
import { and, eq } from "drizzle-orm";
import { canFollow, canInteractWithProject, type Viewer } from "@/lib/auth/permissions";
import { collectionItems, collections, follows, likes, profiles, projects } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

export type ToggleResult =
  { ok: true; active: boolean; count: number } | { ok: false; error: string };

async function projectAccess(db: Db, projectId: string) {
  const [p] = await db
    .select({ ownerId: projects.ownerId, status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId));
  return p ?? null;
}

export async function setLike(
  db: Db,
  viewer: Viewer,
  projectId: string,
  active: boolean,
): Promise<ToggleResult> {
  const project = await projectAccess(db, projectId);
  if (!viewer) return { ok: false, error: "Sign in to like projects." };
  if (!project || !canInteractWithProject(viewer, project))
    return { ok: false, error: "This project isn't available." };

  if (active) {
    await db.insert(likes).values({ userId: viewer.userId, projectId }).onConflictDoNothing();
  } else {
    await db
      .delete(likes)
      .where(and(eq(likes.userId, viewer.userId), eq(likes.projectId, projectId)));
  }
  const [row] = await db
    .select({ count: projects.likeCount })
    .from(projects)
    .where(eq(projects.id, projectId));
  return { ok: true, active, count: row?.count ?? 0 };
}

/** Every user has one default "Saved" collection, created on first save. */
export async function ensureDefaultCollection(db: Db, userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.ownerId, userId), eq(collections.isDefault, true)));
  if (existing) return existing.id;
  const [created] = await db
    .insert(collections)
    .values({ ownerId: userId, name: "Saved", isDefault: true })
    .onConflictDoNothing()
    .returning({ id: collections.id });
  if (created) return created.id;
  // Lost a race with a concurrent first save: read the winner.
  const [again] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.ownerId, userId), eq(collections.isDefault, true)));
  if (!again) throw new Error("Couldn't create the Saved collection");
  return again.id;
}

export async function setSave(
  db: Db,
  viewer: Viewer,
  projectId: string,
  active: boolean,
): Promise<ToggleResult> {
  const project = await projectAccess(db, projectId);
  if (!viewer) return { ok: false, error: "Sign in to save projects." };
  if (!project || !canInteractWithProject(viewer, project))
    return { ok: false, error: "This project isn't available." };

  const collectionId = await ensureDefaultCollection(db, viewer.userId);
  if (active) {
    await db.insert(collectionItems).values({ collectionId, projectId }).onConflictDoNothing();
  } else {
    await db
      .delete(collectionItems)
      .where(
        and(
          eq(collectionItems.collectionId, collectionId),
          eq(collectionItems.projectId, projectId),
        ),
      );
  }
  const [row] = await db
    .select({ count: projects.saveCount })
    .from(projects)
    .where(eq(projects.id, projectId));
  return { ok: true, active, count: row?.count ?? 0 };
}

export async function setFollow(
  db: Db,
  viewer: Viewer,
  targetUserId: string,
  active: boolean,
): Promise<ToggleResult> {
  if (!viewer) return { ok: false, error: "Sign in to follow creators." };
  if (!canFollow(viewer, targetUserId)) return { ok: false, error: "You can't follow yourself." };
  const [target] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, targetUserId));
  if (!target) return { ok: false, error: "That creator doesn't exist." };

  if (active) {
    await db
      .insert(follows)
      .values({ followerId: viewer.userId, followeeId: targetUserId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, viewer.userId), eq(follows.followeeId, targetUserId)));
  }
  const rows = await db
    .select({ x: follows.followerId })
    .from(follows)
    .where(eq(follows.followeeId, targetUserId));
  return { ok: true, active, count: rows.length };
}
