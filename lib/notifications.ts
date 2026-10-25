/** Notifications: what happened to your work and who followed you. */
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/auth/permissions";
import { notifications, profiles, projects, type NotificationKind } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  read: boolean;
  createdAt: Date;
  actor: { handle: string; displayName: string; avatarUrl: string | null } | null;
  project: { slug: string; title: string; status: string } | null;
  note: string | null;
};

/** For the header bell. Never breaks the page: 0 if the count can't be read (e.g. before setup SQL). */
export async function unreadCount(db: Db, userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
    return row?.n ?? 0;
  } catch (err) {
    console.error("[notifications.unread]", err);
    return 0;
  }
}

export async function listNotifications(
  db: Db,
  userId: string,
  limit = 50,
): Promise<NotificationItem[]> {
  const rows = await db
    .select({
      n: notifications,
      actorHandle: profiles.handle,
      actorName: profiles.displayName,
      actorAvatar: profiles.avatarUrl,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      projectStatus: projects.status,
    })
    .from(notifications)
    .leftJoin(profiles, eq(profiles.id, notifications.actorId))
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .catch((err: unknown) => {
      // E.g. the notifications migration hasn't been run yet: show none rather than an error page.
      console.error("[notifications.list]", err);
      return [];
    });
  return rows.map((r) => {
    const meta = (r.n.meta ?? {}) as Record<string, unknown>;
    return {
      id: r.n.id,
      kind: r.n.kind,
      read: r.n.readAt !== null,
      createdAt: r.n.createdAt,
      actor: r.actorHandle
        ? { handle: r.actorHandle, displayName: r.actorName!, avatarUrl: r.actorAvatar }
        : null,
      project:
        r.projectSlug && r.projectTitle && r.projectStatus
          ? { slug: r.projectSlug, title: r.projectTitle, status: r.projectStatus }
          : null,
      note: typeof meta.note === "string" ? meta.note : null,
    };
  });
}

export async function markAllRead(db: Db, viewer: Viewer): Promise<void> {
  if (!viewer) return;
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.recipientId, viewer.userId), isNull(notifications.readAt)));
}

/**
 * Review outcomes, written by the moderation code (likes, follows and remixes use triggers).
 * Best effort: inside a savepoint, so a failed notification never undoes the moderation action
 * it describes.
 */
export async function notifyReviewOutcome(
  db: Pick<Db, "transaction">,
  input: { recipientId: string; projectId: string; kind: "approved" | "removed"; note?: string },
): Promise<void> {
  try {
    await db.transaction(async (sp) => {
      await sp.insert(notifications).values({
        recipientId: input.recipientId,
        kind: input.kind,
        projectId: input.projectId,
        meta: input.note ? { note: input.note.slice(0, 300) } : {},
      });
    });
  } catch (err) {
    console.error("[notifications.review]", err);
  }
}
