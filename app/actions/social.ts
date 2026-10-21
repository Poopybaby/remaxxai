"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { RATE_LIMITS } from "@/config/limits";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { createReport, setOwnProjectVisibility, type ReportInput } from "@/lib/moderation/actions";
import { getProjectBySlug } from "@/lib/projects/queries";
import { setFollow, setLike, setSave, type ToggleResult } from "@/lib/projects/social";
import { pickValues, type FormValues } from "@/lib/forms";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const UUID = /^[0-9a-f-]{36}$/;

async function guard(): Promise<{ ok: false; error: string } | null> {
  if (!isDbConfigured()) return { ok: false, error: "This isn't set up yet." };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in first." };
  const limit = await rateLimit("social", viewer.userId, RATE_LIMITS.social);
  if (!limit.success) return { ok: false, error: "Slow down a little and try again." };
  return null;
}

export async function likeAction(projectId: string, active: boolean): Promise<ToggleResult> {
  if (!UUID.test(projectId)) return { ok: false, error: "Unknown project." };
  const blocked = await guard();
  if (blocked) return blocked;
  return setLike(getDb(), await getViewer(), projectId, active);
}

export async function saveAction(projectId: string, active: boolean): Promise<ToggleResult> {
  if (!UUID.test(projectId)) return { ok: false, error: "Unknown project." };
  const blocked = await guard();
  if (blocked) return blocked;
  return setSave(getDb(), await getViewer(), projectId, active);
}

export async function followAction(userId: string, active: boolean): Promise<ToggleResult> {
  if (!UUID.test(userId)) return { ok: false, error: "Unknown creator." };
  const blocked = await guard();
  if (blocked) return blocked;
  return setFollow(getDb(), await getViewer(), userId, active);
}

export type ReportState = {
  status: "idle" | "sent" | "error";
  message: string;
  values?: FormValues;
};

/** Report button on projects (signed in). */
export async function reportAction(_prev: ReportState, form: FormData): Promise<ReportState> {
  const v = () => pickValues(form, ["reason", "details"]);
  if (!isDbConfigured())
    return { status: "error", values: v(), message: "Reporting isn't set up yet." };
  const viewer = await getViewer();
  if (!viewer) return { status: "error", values: v(), message: "Sign in to report." };
  const limit = await rateLimit("report", viewer.userId, RATE_LIMITS.report);
  if (!limit.success)
    return {
      status: "error",
      values: v(),
      message: "You've sent a lot of reports. Try again later.",
    };

  const input: ReportInput = {
    projectId: String(form.get("projectId") ?? "") || null,
    profileId: null,
    reason: String(form.get("reason") ?? "") as ReportInput["reason"],
    details: String(form.get("details") ?? ""),
    isDmca: false,
    contactName: null,
    contactEmail: null,
  };
  const res = await createReport(getDb(), viewer.userId, input);
  return res.ok
    ? { status: "sent", message: "Thanks. An admin will review it." }
    : { status: "error", values: v(), message: res.error };
}

/** Public DMCA notice form; no account needed. */
export async function dmcaAction(_prev: ReportState, form: FormData): Promise<ReportState> {
  const v = () =>
    pickValues(form, ["link", "work", "name", "email", "address", "signature", "swear"]);
  if (!isDbConfigured())
    return {
      status: "error",
      values: v(),
      message: "The form isn't set up yet. Email us instead.",
    };
  const ip = clientIp(await headers());
  const limit = await rateLimit("dmca", ip, RATE_LIMITS.dmca);
  if (!limit.success)
    return {
      status: "error",
      values: v(),
      message: "Too many notices from this network. Email us instead.",
    };

  const link = String(form.get("link") ?? "").trim();
  const slug = /\/p\/([a-z0-9-]+)/.exec(link)?.[1];
  if (!slug)
    return {
      status: "error",
      values: v(),
      message: "Paste the full REMAXX link to the project (it contains /p/).",
    };
  if (form.get("swear") !== "on") {
    return {
      status: "error",
      values: v(),
      message: "Confirm the statements at the bottom of the form.",
    };
  }

  const db = getDb();
  const project = await getProjectBySlug(db, slug);
  if (!project)
    return { status: "error", values: v(), message: "We couldn't find a project at that link." };

  const res = await createReport(db, (await getViewer())?.userId ?? null, {
    projectId: project.id,
    profileId: null,
    reason: "copyright",
    details: [
      `Original work: ${String(form.get("work") ?? "").trim()}`,
      `Signature: ${String(form.get("signature") ?? "").trim()}`,
      `Address/phone: ${String(form.get("address") ?? "").trim()}`,
      "Good-faith and accuracy statements confirmed under penalty of perjury.",
    ].join("\n"),
    isDmca: true,
    contactName: String(form.get("name") ?? "").trim() || null,
    contactEmail: String(form.get("email") ?? "").trim() || null,
  });
  return res.ok
    ? { status: "sent", message: "Notice received. We'll review it and email you." }
    : { status: "error", values: v(), message: res.error };
}

export async function visibilityAction(projectId: string, to: "published" | "unpublished") {
  if (!UUID.test(projectId) || !isDbConfigured())
    return { ok: false as const, error: "Unknown project." };
  const res = await setOwnProjectVisibility(getDb(), await getViewer(), projectId, to);
  if (res.ok) refresh();
  return res;
}
