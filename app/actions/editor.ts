"use server";

import { redirect } from "next/navigation";
import { RATE_LIMITS } from "@/config/limits";
import { PermissionError } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { rateLimit } from "@/lib/ratelimit";
import { createRemix, RemixError } from "@/lib/projects/remix";
import { deleteDraft } from "@/lib/projects/versions";

const UUID = /^[0-9a-f-]{36}$/;

export type RemixState = { error: string | null };

/** Remix button: makes a private draft copy and opens it in the editor. */
export async function remixAction(_prev: RemixState, form: FormData): Promise<RemixState> {
  const projectId = String(form.get("projectId") ?? "");
  if (!UUID.test(projectId)) return { error: "That project isn't available." };
  const viewer = await getViewer();
  if (!viewer)
    redirect(`/login?next=${encodeURIComponent(String(form.get("returnTo") ?? "/explore"))}`);
  if (!(await rateLimit("remix", viewer.userId, RATE_LIMITS.remix)).success) {
    return { error: "You've remixed a lot this hour. Try again later." };
  }
  let draftId: string;
  try {
    draftId = (await createRemix(getDb(), viewer, projectId)).id;
  } catch (err) {
    if (err instanceof RemixError || err instanceof PermissionError) return { error: err.message };
    console.error("[remix]", err);
    return { error: "We couldn't make a remix just now. Try again." };
  }
  redirect(`/edit/${draftId}`);
}

export async function deleteDraftAction(form: FormData): Promise<void> {
  const projectId = String(form.get("projectId") ?? "");
  if (!UUID.test(projectId)) return;
  const viewer = await getViewer();
  await deleteDraft(getDb(), viewer, projectId);
  redirect(viewer ? "/drafts" : "/");
}
