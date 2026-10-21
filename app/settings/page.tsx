import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewerContext } from "@/lib/auth/viewer";
import { ProfileSettingsForm } from "./profile-settings-form";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-14">
      <h1 className="type-wide text-4xl font-black">Settings</h1>
      <Suspense
        fallback={<div className="bg-panel h-96 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <SettingsContent />
      </Suspense>
    </section>
  );
}

async function SettingsContent() {
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect("/login?next=/settings");
  if (ctx.status === "needs_onboarding") redirect("/onboarding?next=/settings");
  const { profile } = ctx;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted">
          Signed in as <span className="text-fg">{ctx.email ?? "unknown email"}</span>
        </p>
        <p className="text-muted">
          Your public profile:{" "}
          <Link href={`/u/${profile.handle}`} className="text-fg underline underline-offset-4">
            @{profile.handle}
          </Link>
        </p>
      </div>
      <ProfileSettingsForm
        displayName={profile.displayName}
        bio={profile.bio}
        websiteUrl={profile.websiteUrl ?? ""}
      />
    </div>
  );
}
