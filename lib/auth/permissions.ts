/**
 * Authorization rules in one place. Pure functions, no I/O, so every rule is unit-tested.
 * Server code must call these before reading or writing data on someone's behalf: the
 * database connection bypasses RLS.
 */
import type { ProjectStatus, UserRole } from "@/lib/db/schema";

/** The signed-in person making a request, or null for an anonymous visitor. */
export type Viewer = { userId: string; role: UserRole } | null;

export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

export function isSignedIn(viewer: Viewer): viewer is NonNullable<Viewer> {
  return viewer !== null;
}

export function isAdmin(viewer: Viewer): boolean {
  return viewer?.role === "admin";
}

/** Owners edit their own profile; admins can edit any profile for moderation. */
export function canEditProfile(viewer: Viewer, profileId: string): boolean {
  if (!viewer) return false;
  return viewer.userId === profileId || isAdmin(viewer);
}

/** Only admins can change roles, and never their own (prevents locking out the last admin by accident). */
export function canChangeRole(viewer: Viewer, targetUserId: string): boolean {
  return isAdmin(viewer) && viewer?.userId !== targetUserId;
}

export function canAccessAdmin(viewer: Viewer): boolean {
  return isAdmin(viewer);
}

// ── Projects ─────────────────────────────────────────────────────────────────

export type ProjectAccess = { ownerId: string; status: ProjectStatus };

const isOwner = (viewer: Viewer, project: ProjectAccess) => viewer?.userId === project.ownerId;

/** Published projects are public; everything else only to its owner and admins. */
export function canViewProject(viewer: Viewer, project: ProjectAccess): boolean {
  if (project.status === "published") return true;
  return isOwner(viewer, project) || isAdmin(viewer);
}

/** Owners edit their own projects, except while an admin has them removed or under review. */
export function canEditProject(viewer: Viewer, project: ProjectAccess): boolean {
  if (!isOwner(viewer, project)) return false;
  return project.status !== "removed" && project.status !== "hidden_pending_review";
}

/** Owners can hide or re-show their own project; they can't undo an admin decision. */
export function canSetOwnVisibility(
  viewer: Viewer,
  project: ProjectAccess,
  to: ProjectStatus,
): boolean {
  if (!isOwner(viewer, project)) return false;
  const ownerControlled: ProjectStatus[] = ["published", "unpublished"];
  return ownerControlled.includes(project.status) && ownerControlled.includes(to);
}

/** Likes and saves: signed-in people, on public projects. */
export function canInteractWithProject(viewer: Viewer, project: ProjectAccess): boolean {
  return viewer !== null && project.status === "published";
}

/** Admin moderation: review queue, takedowns, restores. */
export function canModerate(viewer: Viewer): boolean {
  return isAdmin(viewer);
}

export function canFollow(viewer: Viewer, targetUserId: string): boolean {
  return viewer !== null && viewer.userId !== targetUserId;
}

export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new PermissionError(message);
}
