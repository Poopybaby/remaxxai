import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { suggestHandle } from "@/lib/auth/handles";
import { getViewerContext } from "@/lib/auth/viewer";
import { safeNextPath } from "@/lib/security/hosts";
import { DEFAULT_AVATARS, randomDefaultAvatarUrl } from "@/config/avatars";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your profile", robots: { index: false } };

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-14">
      <div className="flex flex-col gap-3">
        <h1 className="type-wide text-4xl font-black">Set up your profile</h1>
        <p className="text-muted">
          This is how people will find and credit your work. You can change your display name later;
          your handle is permanent.
        </p>
      </div>
      <Suspense
        fallback={<div className="bg-panel h-96 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <OnboardingGate searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function OnboardingGate({ searchParams }: Pick<PageProps<"/onboarding">, "searchParams">) {
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect("/login?next=/onboarding");
  if (ctx.status === "active") redirect(`/u/${ctx.profile.handle}`);

  const params = await searchParams;
  const nextParam = typeof params.next === "string" ? params.next : null;
  const next = safeNextPath(nextParam, "");

  return (
    <OnboardingForm
      next={next}
      suggestedName={ctx.suggestedName ?? ""}
      suggestedHandle={suggestHandle(ctx.suggestedName ?? ctx.email ?? "") ?? ""}
      suggestedAvatar={
        DEFAULT_AVATARS.find((a) => a.url === randomDefaultAvatarUrl())?.id ?? "sprinkles"
      }
    />
  );
}
