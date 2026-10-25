"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { adminAdjustCredits } from "@/lib/billing/credits";
import { getDb } from "@/lib/db/client";
import { getProfileByHandle } from "@/lib/profiles";
import { approveProject, dismissReport, removeProject } from "@/lib/moderation/actions";
import { refreshSearchIndex } from "@/lib/search/background";

const UUID = /^[0-9a-f-]{36}$/;
const id = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? "");
  return UUID.test(v) ? v : null;
};

// Each action re-checks the admin role inside lib/moderation/actions; the page check is UI only.

export async function removeProjectAction(form: FormData): Promise<void> {
  const projectId = id(form, "projectId");
  if (!projectId) return;
  await removeProject(getDb(), await getViewer(), projectId, {
    copyright: form.get("copyright") === "on",
    note: String(form.get("note") ?? "").slice(0, 500),
    reportId: id(form, "reportId") ?? undefined,
  });
  refresh();
}

export async function approveProjectAction(form: FormData): Promise<void> {
  const projectId = id(form, "projectId");
  if (!projectId) return;
  await approveProject(
    getDb(),
    await getViewer(),
    projectId,
    String(form.get("note") ?? "").slice(0, 500),
  );
  // Now that it's public, describe and embed it for search.
  after(() => refreshSearchIndex([projectId]));
  refresh();
}

/** Admin button: index anything missing (new uploads, seeds without embeddings). */
export async function refreshSearchIndexAction(): Promise<void> {
  if (!canAccessAdmin(await getViewer())) return;
  await refreshSearchIndex();
  refresh();
}

export async function dismissReportAction(form: FormData): Promise<void> {
  const reportId = id(form, "reportId");
  if (!reportId) return;
  await dismissReport(
    getDb(),
    await getViewer(),
    reportId,
    String(form.get("note") ?? "").slice(0, 500),
  );
  refresh();
}

export type AdjustState = { message: string | null; error: boolean };

/** Admin: add or remove credits for someone by handle (support refunds, testing). */
export async function adjustCreditsAction(
  _prev: AdjustState,
  form: FormData,
): Promise<AdjustState> {
  const viewer = await getViewer();
  if (!canAccessAdmin(viewer)) return { message: "Admins only.", error: true };
  const handle = String(form.get("handle") ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  const delta = Number(form.get("delta"));
  const note = String(form.get("note") ?? "").trim();
  if (!handle) return { message: "Enter a handle.", error: true };
  if (!note) return { message: "Add a short note saying why.", error: true };
  const db = getDb();
  const profile = await getProfileByHandle(db, handle);
  if (!profile) return { message: `No one has the handle @${handle}.`, error: true };
  try {
    const balance = await adminAdjustCredits(db, viewer, {
      userId: profile.id,
      delta,
      note,
      // One click, one adjustment: the form carries a fresh id each time it renders.
      requestId: String(form.get("requestId") ?? crypto.randomUUID()).slice(0, 64),
    });
    refresh();
    return {
      message: `@${handle} now has ${balance.toLocaleString("en-US")} credits.`,
      error: false,
    };
  } catch (err) {
    return {
      message: err instanceof Error ? err.message : "That didn't work.",
      error: true,
    };
  }
}
