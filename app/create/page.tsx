import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { siteConfig } from "@/config/site";
import { aiAccessMode, modelOptions } from "@/lib/ai/server";
import { canUseAi } from "@/lib/auth/permissions";
import { getViewerContext } from "@/lib/auth/viewer";
import { getEntitlement } from "@/lib/billing/credits";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { CreateStudio } from "./create-studio";

export const metadata: Metadata = {
  title: "Create",
  description: "Start a new project on REMAXX: describe it to AI, or start from a blank canvas.",
  robots: { index: false },
};

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="bg-ink h-[calc(100dvh-4rem)]" aria-busy />}>
      <CreateLoader />
    </Suspense>
  );
}

async function CreateLoader() {
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect("/login?next=/create");
  if (ctx.status === "needs_onboarding") redirect("/onboarding?next=/create");
  if (!isDbConfigured()) redirect("/");
  const viewer = { userId: ctx.userId, role: ctx.profile.role };
  const ent = await getEntitlement(getDb(), ctx.userId);
  return (
    <CreateStudio
      data={{
        models: modelOptions(),
        credits: {
          balance: ent.balance,
          trialPrompts: ent.trialPrompts,
          planName: ent.plan?.name ?? null,
          modelTier: ent.modelTier,
        },
        ai: canUseAi(viewer, aiAccessMode())
          ? { allowed: true }
          : {
              allowed: false,
              reason:
                "AI editing is in early access for now. Pick a starting point and use “Edit by hand”.",
            },
        previewOrigin: new URL(siteConfig.previewOrigin).origin,
      }}
    />
  );
}
