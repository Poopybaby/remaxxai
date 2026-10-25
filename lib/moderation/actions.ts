/**
 * Reports, the admin review queue and takedowns. Every admin action writes to admin_audit_log.
 *
 * Takedown cascade (decided Oct 21, 2026, PLAN.md Q4): when a project is removed for copyright,
 * its published remixes are hidden pending admin review (not deleted), and their credit line
 * shows the original was removed.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assert, canModerate, canSetOwnVisibility, type Viewer } from "@/lib/auth/permissions";
import {
  adminAuditLog,
  moderationEvents,
  profiles,
  projects,
  REPORT_REASONS,
  reports,
  type ProjectStatus,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { notifyReviewOutcome } from "@/lib/notifications";
import { getDescendantIds, type DbLike } from "@/lib/licensing/chain";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ── Reports ───────────────────────────────────────────────────────────────────

const reportSchema = z
  .object({
    projectId: z.uuid().nullable(),
    profileId: z.uuid().nullable(),
    reason: z.enum(REPORT_REASONS, { message: "Pick a reason." }),
    details: z.string().trim().max(2000, "Keep details under 2,000 characters."),
    isDmca: z.boolean(),
    contactName: z.string().trim().max(120).nullable(),
    contactEmail: z.email({ message: "Enter a valid email address." }).max(254).nullable(),
  })
  .refine((r) => r.projectId || r.profileId, { message: "Nothing to report." })
  .refine((r) => !r.isDmca || (r.contactName && r.contactEmail && r.details.length >= 20), {
    message: "Copyright notices need your name, email and a description of the work.",
  });

export type ReportInput = z.input<typeof reportSchema>;

export async function createReport(
  db: Db,
  reporterId: string | null,
  input: ReportInput,
): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const r = parsed.data;
  if (!reporterId && !r.isDmca) return { ok: false, error: "Sign in to report." };

  if (r.projectId) {
    const [exists] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, r.projectId));
    if (!exists) return { ok: false, error: "That project doesn't exist." };
  }
  await db.insert(reports).values({
    reporterId,
    targetProjectId: r.projectId,
    targetProfileId: r.profileId,
    reason: r.reason,
    details: r.details,
    isDmca: r.isDmca,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
  });
  return { ok: true };
}

export type QueueReport = {
  id: string;
  reason: string;
  details: string;
  isDmca: boolean;
  contactName: string | null;
  contactEmail: string | null;
  createdAt: Date;
  project: { id: string; slug: string; title: string; status: ProjectStatus } | null;
  reporterHandle: string | null;
};

export async function listOpenReports(db: Db, viewer: Viewer): Promise<QueueReport[]> {
  if (!canModerate(viewer)) return [];
  const rows = await db
    .select({
      r: reports,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      projectStatus: projects.status,
      reporterHandle: profiles.handle,
    })
    .from(reports)
    .leftJoin(projects, eq(projects.id, reports.targetProjectId))
    .leftJoin(profiles, eq(profiles.id, reports.reporterId))
    .where(eq(reports.status, "open"))
    .orderBy(desc(reports.isDmca), asc(reports.createdAt))
    .limit(200);
  return rows.map(({ r, projectSlug, projectTitle, projectStatus, reporterHandle }) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    isDmca: r.isDmca,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    createdAt: r.createdAt,
    project:
      r.targetProjectId && projectSlug && projectTitle && projectStatus
        ? { id: r.targetProjectId, slug: projectSlug, title: projectTitle, status: projectStatus }
        : null,
    reporterHandle,
  }));
}

export type QueueProject = {
  id: string;
  slug: string;
  title: string;
  status: ProjectStatus;
  statusReason: string | null;
  ownerHandle: string;
  createdAt: Date;
  findings: string[];
};

/** Projects waiting on an admin: held by the scanner or moderation, or hidden by a takedown cascade. */
export async function listProjectsAwaitingReview(db: Db, viewer: Viewer): Promise<QueueProject[]> {
  if (!canModerate(viewer)) return [];
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      status: projects.status,
      statusReason: projects.statusReason,
      ownerHandle: profiles.handle,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(profiles, eq(profiles.id, projects.ownerId))
    .where(inArray(projects.status, ["pending_review", "hidden_pending_review"]))
    .orderBy(asc(projects.createdAt))
    .limit(200);
  if (rows.length === 0) return [];

  const events = await db
    .select({ subjectId: moderationEvents.subjectId, detail: moderationEvents.detail })
    .from(moderationEvents)
    .where(
      and(
        eq(moderationEvents.subjectType, "project"),
        inArray(
          moderationEvents.subjectId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const findingsBy = new Map<string, string[]>();
  for (const e of events) {
    if (!e.subjectId) continue;
    const detail = e.detail as {
      findings?: { message: string; path: string }[];
      categories?: string[];
    };
    const list = findingsBy.get(e.subjectId) ?? [];
    for (const f of detail.findings ?? []) list.push(`${f.message} (${f.path})`);
    for (const c of detail.categories ?? []) list.push(`Moderation: ${c}`);
    findingsBy.set(e.subjectId, list);
  }
  return rows.map((r) => ({ ...r, findings: findingsBy.get(r.id) ?? [] }));
}

// ── Admin actions ─────────────────────────────────────────────────────────────

async function audit(
  db: DbLike,
  adminId: string,
  action: string,
  targetId: string,
  detail: Record<string, unknown>,
) {
  await db
    .insert(adminAuditLog)
    .values({ adminId, action, targetType: "project", targetId, detail });
}

/**
 * Takes a project down. For copyright removals, published remixes of it are hidden pending review.
 * Optionally resolves the report that prompted it.
 */
export async function removeProject(
  db: Db,
  viewer: Viewer,
  projectId: string,
  opts: { copyright: boolean; note: string; reportId?: string },
): Promise<ActionResult & { hiddenDescendants?: number }> {
  if (!viewer || !canModerate(viewer))
    return { ok: false, error: "Only admins can remove projects." };
  return db.transaction(async (tx) => {
    const [project] = await tx
      .update(projects)
      .set({
        status: "removed",
        statusReason:
          opts.note ||
          (opts.copyright ? "Removed after a copyright notice." : "Removed by an admin."),
      })
      .where(eq(projects.id, projectId))
      .returning({
        id: projects.id,
        ownerId: projects.ownerId,
        statusReason: projects.statusReason,
      });
    if (!project) return { ok: false as const, error: "Project not found." };
    await notifyReviewOutcome(tx, {
      recipientId: project.ownerId,
      projectId,
      kind: "removed",
      note: project.statusReason ?? undefined,
    });

    let hidden = 0;
    if (opts.copyright) {
      const descendants = await getDescendantIds(tx, projectId);
      if (descendants.length) {
        const updated = await tx
          .update(projects)
          .set({
            status: "hidden_pending_review",
            statusReason:
              "Hidden while we review it: something this remix is built on was removed after a copyright notice.",
          })
          .where(and(inArray(projects.id, descendants), eq(projects.status, "published")))
          .returning({ id: projects.id });
        hidden = updated.length;
      }
    }

    if (opts.reportId) {
      await tx
        .update(reports)
        .set({
          status: "actioned",
          resolvedBy: viewer.userId,
          resolutionNote: opts.note,
          resolvedAt: new Date(),
        })
        .where(eq(reports.id, opts.reportId));
    }
    await audit(tx, viewer.userId, opts.copyright ? "remove_copyright" : "remove", projectId, {
      note: opts.note,
      hiddenDescendants: hidden,
      reportId: opts.reportId ?? null,
    });
    return { ok: true as const, hiddenDescendants: hidden };
  });
}

/** Publishes a held, hidden or removed project. */
export async function approveProject(
  db: Db,
  viewer: Viewer,
  projectId: string,
  note = "",
): Promise<ActionResult> {
  if (!viewer || !canModerate(viewer))
    return { ok: false, error: "Only admins can approve projects." };
  const [current] = await db
    .select({
      status: projects.status,
      publishedAt: projects.publishedAt,
      ownerId: projects.ownerId,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!current) return { ok: false, error: "Project not found." };
  const reviewable: ProjectStatus[] = ["pending_review", "hidden_pending_review", "removed"];
  if (!reviewable.includes(current.status))
    return { ok: false, error: "This project isn't waiting for review." };

  await db
    .update(projects)
    .set({
      status: "published",
      statusReason: null,
      publishedAt: current.publishedAt ?? new Date(),
    })
    .where(eq(projects.id, projectId));
  await audit(db, viewer.userId, "approve", projectId, { from: current.status, note });
  await notifyReviewOutcome(db, { recipientId: current.ownerId, projectId, kind: "approved" });
  return { ok: true };
}

export async function dismissReport(
  db: Db,
  viewer: Viewer,
  reportId: string,
  note = "",
): Promise<ActionResult> {
  if (!viewer || !canModerate(viewer))
    return { ok: false, error: "Only admins can resolve reports." };
  const updated = await db
    .update(reports)
    .set({
      status: "dismissed",
      resolvedBy: viewer.userId,
      resolutionNote: note,
      resolvedAt: new Date(),
    })
    .where(and(eq(reports.id, reportId), eq(reports.status, "open")))
    .returning({ id: reports.id, projectId: reports.targetProjectId });
  if (!updated[0]) return { ok: false, error: "That report is already resolved." };
  await db.insert(adminAuditLog).values({
    adminId: viewer.userId,
    action: "dismiss_report",
    targetType: "report",
    targetId: reportId,
    detail: { note, projectId: updated[0].projectId },
  });
  return { ok: true };
}

/** Owners hide or re-show their own project. */
export async function setOwnProjectVisibility(
  db: Db,
  viewer: Viewer,
  projectId: string,
  to: "published" | "unpublished",
): Promise<ActionResult> {
  const [p] = await db
    .select({
      ownerId: projects.ownerId,
      status: projects.status,
      publishedAt: projects.publishedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!p || !canSetOwnVisibility(viewer, p, to))
    return { ok: false, error: "You can't change this project's visibility." };
  await db
    .update(projects)
    .set({
      status: to,
      publishedAt: to === "published" ? (p.publishedAt ?? new Date()) : p.publishedAt,
    })
    .where(eq(projects.id, projectId));
  return { ok: true };
}

/** Admins feature standout published projects in the Staff picks feed. */
export async function setStaffPick(
  db: Db,
  viewer: Viewer,
  projectId: string,
  on: boolean,
): Promise<void> {
  assert(canModerate(viewer), "Only admins can choose staff picks.");
  await db
    .update(projects)
    .set({ isStaffPick: on })
    .where(and(eq(projects.id, projectId), eq(projects.status, "published")));
}
