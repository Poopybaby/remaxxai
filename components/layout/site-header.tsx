import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";
import { getViewerContext } from "@/lib/auth/viewer";
import { UserMenu } from "./user-menu";

/**
 * The header shell is static and prerenders; only the account area reads the session,
 * so it streams in behind a Suspense boundary.
 */
export function SiteHeader() {
  return (
    <header className="border-line/70 bg-ink/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark className="text-[22px] sm:text-2xl" />
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
  return (
    <UserMenu
      handle={profile.handle}
      displayName={profile.displayName}
      avatarUrl={profile.avatarUrl}
    />
  );
}
