"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlanId } from "@/config/plans";
import { Button, ButtonLink } from "@/components/ui/button";
import { track } from "@/lib/monitoring/analytics";

export function PlanButton({
  planId,
  planName,
  mine,
  hasPlan,
  open,
  signedIn,
  featured,
}: {
  planId: PlanId;
  planName: string;
  mine: boolean;
  hasPlan: boolean;
  open: boolean;
  signedIn: boolean;
  featured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variant = featured ? "primary" : "secondary";

  if (mine) {
    return (
      <ButtonLink href="/billing" variant="secondary" className="w-full">
        Manage plan
      </ButtonLink>
    );
  }
  if (!open) {
    return (
      <Button variant={variant} className="w-full" disabled>
        Opening soon
      </Button>
    );
  }
  if (!signedIn) {
    return (
      <ButtonLink href="/login?next=/pricing" variant={variant} className="w-full">
        Sign up for {planName}
      </ButtonLink>
    );
  }

  async function choose() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        kind?: "redirect" | "changed";
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "That didn't work. Try again.");
        setBusy(false);
        return;
      }
      track("checkout_started", { plan: planId });
      if (json.kind === "redirect" && json.url) {
        // Stripe's hosted checkout page.
        window.location.assign(json.url);
        return;
      }
      router.push("/billing?checkout=changed");
    } catch {
      setError("That didn't work. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant={variant} className="w-full" onClick={() => void choose()} disabled={busy}>
        {busy ? "Opening checkout…" : hasPlan ? `Switch to ${planName}` : `Choose ${planName}`}
      </Button>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
