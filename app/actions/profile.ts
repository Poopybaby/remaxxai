"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { defaultAvatar } from "@/config/avatars";
import { RATE_LIMITS } from "@/config/limits";
import { AvatarError, chooseDefaultAvatar } from "@/lib/avatars";
import { getViewer, getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { createProfile, updateProfile, type FieldErrors } from "@/lib/profiles";
import { rateLimit } from "@/lib/ratelimit";
import { safeNextPath } from "@/lib/security/hosts";
import { pickValues, type FormValues } from "@/lib/forms";

export type FormState = { errors: FieldErrors; saved?: boolean; values?: FormValues };

const NOT_CONFIGURED: FormState = {
  errors: { form: "Accounts aren't set up on this deployment yet." },
};

export async function createProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect("/login?next=/onboarding");
  if (ctx.status === "active") redirect(`/u/${ctx.profile.handle}`);
  if (!isDbConfigured()) return NOT_CONFIGURED;

  const result = await createProfile(getDb(), ctx.userId, {
    handle: String(formData.get("handle") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    ageConfirmed: (formData.get("ageConfirmed") === "on") as true,
    termsAccepted: (formData.get("termsAccepted") === "on") as true,
    // One of the crew (picked in the form, else at random). People can upload their own later.
    avatarUrl: defaultAvatar(String(formData.get("avatar") ?? ""))?.url ?? null,
  });
  if (!result.ok) {
    return {
      errors: result.errors,
      values: pickValues(formData, [
        "handle",
        "displayName",
        "ageConfirmed",
        "termsAccepted",
        "avatar",
      ]),
    };
  }

  // The header lives in the root layout, which a redirect alone doesn't re-render.
  refresh();
  redirect(safeNextPath(String(formData.get("next") ?? ""), `/u/${result.value.handle}`));
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/settings");
  if (!isDbConfigured()) return NOT_CONFIGURED;

  const limit = await rateLimit("profile-update", viewer.userId, RATE_LIMITS.profileUpdate);
  const values = pickValues(formData, ["displayName", "bio", "websiteUrl"]);
  if (!limit.success)
    return {
      errors: { form: "You're saving too often. Wait a few minutes and try again." },
      values,
    };

  const result = await updateProfile(getDb(), viewer, viewer.userId, {
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
  });
  if (!result.ok) return { errors: result.errors, values };

  updateTag(`profile:${result.value.handle}`);
  return { errors: {}, saved: true, values };
}

export type AvatarState = { error: string | null; url: string | null };

/** Switches the profile picture to one of the REMAXX crew. */
export async function chooseAvatarAction(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/settings");
  if (!isDbConfigured())
    return { error: "Accounts aren't set up on this deployment yet.", url: null };
  if (!(await rateLimit("profile-update", viewer.userId, RATE_LIMITS.profileUpdate)).success) {
    return { error: "You're changing this too often. Wait a few minutes.", url: null };
  }
  const id = String(formData.get("avatar") ?? "");
  try {
    const handle = await chooseDefaultAvatar(getDb(), viewer, id);
    updateTag(`profile:${handle}`);
    refresh();
    return { error: null, url: defaultAvatar(id)?.url ?? null };
  } catch (err) {
    if (err instanceof AvatarError) return { error: err.message, url: null };
    throw err;
  }
}
