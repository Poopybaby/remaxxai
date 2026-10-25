import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";
import { aiAccessMode } from "@/lib/ai/server";
import { canUseAi } from "@/lib/auth/permissions";
import { getViewerContext } from "@/lib/auth/viewer";
import { readCredits } from "@/lib/billing/credits";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { UserMenu } from "./user-menu";

/**
 * The header shell is static and prerenders; only the account area reads the session,
 * so it streams in behind a Suspense boundary.
 */
export function SiteHeader() {
  return (
    <header className="border-line/70 bg-ink/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Wordmark className="text-[22px] sm:text-2xl" />
          <nav aria-label="Main" className="flex items-center gap-1 text-[15px] font-semibold">
            <Link
              href="/explore"
              className="text-muted hover:bg-panel hover:text-fg rounded-lg px-2.5 py-1.5"
            >
              Explore
            </Link>
            {/* On phones Pricing lives in the account menu and the footer, so the header fits. */}
            <Link
              href="/pricing"
              className="text-muted hover:bg-panel hover:text-fg hidden rounded-lg px-2.5 py-1.5 sm:inline-block"
            >
              Pricing
            </Link>
          </nav>
        </div>
        <nav aria-label="Account" className="flex min-h-10 items-center gap-2">
          <Suspense fallback={<div className="bg-panel size-9 rounded-full" aria-hidden />}>
            <HeaderAccount />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function HeaderAccount() {
  const viewer = await getViewerContext();
  if (viewer.status === "anonymous") {
    return (
      <ButtonLink href="/login" variant="secondary" size="sm">
        Sign in
      </ButtonLink>
    );
  }
  if (viewer.status === "needs_onboarding") {
    return (
      <ButtonLink href="/onboarding" size="sm">
        Finish setting up
      </ButtonLink>
    );
  }
  const { profile } = viewer;
  const role = { userId: viewer.userId, role: profile.role };
  // Credits only mean something to people who can use AI.
  const credits =
    isDbConfigured() && canUseAi(role, aiAccessMode())
      ? await readCredits(getDb(), viewer.userId)
      : null;
  return (
    <>
      {credits ? (
        <Link
          href="/billing"
          className="border-line text-muted hover:text-fg hover:border-line-strong hidden h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums sm:inline-flex"
          title="Credits for AI edits"
        >
          <span aria-hidden className="bg-cyan size-1.5 rounded-full" />
          {credits.balance > 0 || credits.trialPrompts === 0
            ? `${credits.balance.toLocaleString("en-US")} credits`
            : `${credits.trialPrompts} free ${credits.trialPrompts === 1 ? "prompt" : "prompts"}`}
        </Link>
      ) : null}
      <ButtonLink href="/upload" size="sm" variant="secondary" className="hidden sm:inline-flex">
        Upload
      </ButtonLink>
      <ButtonLink href="/create" size="sm">
        Create
      </ButtonLink>
      <UserMenu
        handle={profile.handle}
        displayName={profile.displayName}
        avatarUrl={profile.avatarUrl}
        isAdmin={profile.role === "admin"}
      />
    </>
  );
}
