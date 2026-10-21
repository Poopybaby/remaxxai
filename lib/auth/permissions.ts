/**
 * Authorization rules in one place. Pure functions, no I/O, so every rule is unit-tested.
 * Server code must call these before reading or writing data on someone's behalf: the
 * database connection bypasses RLS.
 */
import type { UserRole } from "@/lib/db/schema";

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

export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new PermissionError(message);
}
