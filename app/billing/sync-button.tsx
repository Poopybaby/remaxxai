"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Pulls the subscription straight from Stripe. Runs once by itself when someone comes back from
 * checkout (`auto`), so credits show up even if Stripe's webhook is slow or missing.
 */
export function SyncFromStripe({ auto }: { auto: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(auto);
  const [note, setNote] = useState<string | null>(null);
  const ran = useRef(false);

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        result?: string;
        plan?: string | null;
        error?: string;
      };
      if (!res.ok) setNote(json.error ?? "That didn't work. Try again.");
      else if (!json.plan)
        setNote(
          json.result === "no_subscription" || json.result === "no_customer"
            ? "Stripe doesn't show a subscription for you yet."
            : "Stripe doesn't show an active plan yet. Try again in a minute.",
        );
      router.refresh();
    } catch {
      setNote("That didn't work. Check your connection and try again.");
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!auto || ran.current) return;
    ran.current = true;
    void sync();
    // Runs once on arrival from checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="ghost" onClick={() => void sync()} disabled={busy}>
        {busy ? "Checking Stripe…" : "Refresh from Stripe"}
      </Button>
      {note ? (
        <p role="status" className="text-muted text-xs">
          {note}
        </p>
      ) : null}
    </div>
  );
}
