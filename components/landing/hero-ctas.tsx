import { FREE_TRIAL_PROMPTS } from "@/config/plans";
import { ButtonLink } from "@/components/ui/button";
import { getViewerContext } from "@/lib/auth/viewer";

/** Sign up / sign in for visitors; straight into the product for people already signed in. */
export async function HeroCtas() {
  const ctx = await getViewerContext();
  if (ctx.status === "active") {
    return (
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/create" size="lg">
          Start creating
        </ButtonLink>
        <ButtonLink href="/explore" size="lg" variant="secondary">
          Explore templates
        </ButtonLink>
      </div>
    );
  }
  return <SignedOutCtas finishSetup={ctx.status === "needs_onboarding"} />;
}

export function SignedOutCtas({ finishSetup = false }: { finishSetup?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={finishSetup ? "/onboarding" : "/signup"} size="lg">
          {finishSetup ? "Finish setting up" : "Sign up free"}
        </ButtonLink>
        <ButtonLink href="/login" size="lg" variant="secondary">
          Sign in
        </ButtonLink>
      </div>
      <p className="text-faint text-sm">
        Free to join. {FREE_TRIAL_PROMPTS} free AI prompts, no card needed.
      </p>
    </div>
  );
}
