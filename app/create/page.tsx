import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { aiAccessMode } from "@/lib/ai/server";
import { canUseAi } from "@/lib/auth/permissions";
import { getViewerContext } from "@/lib/auth/viewer";
import { CreateForm } from "./create-form";

export const metadata: Metadata = {
  title: "Create",
  description: "Start a new project on REMAXX: describe it to AI or build from a starter.",
  robots: { index: false },
};

export default function CreatePage() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="type-wide text-4xl font-black sm:text-5xl">Create</h1>
        <p className="text-muted max-w-[60ch]">
          Start something new. Describe what you want and let AI build it, or pick a starter and
          make it yours. You can publish it to the gallery when it&apos;s ready.
        </p>
      </div>
      <Suspense
        fallback={<div className="bg-panel h-[28rem] rounded-[var(--radius-card)]" aria-hidden />}
      >
        <CreateGate />
      </Suspense>
    </section>
  );
}

async function CreateGate() {
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect("/login?next=/create");
  if (ctx.status === "needs_onboarding") redirect("/onboarding?next=/create");
  const aiAllowed = canUseAi({ userId: ctx.userId, role: ctx.profile.role }, aiAccessMode());
  return <CreateForm aiAllowed={aiAllowed} />;
}
