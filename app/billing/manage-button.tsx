"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Opens Stripe's billing page (card, invoices, cancel). */
export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      setError(json.error ?? "That didn't work. Try again.");
    } catch {
      setError("That didn't work. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="secondary" onClick={() => void open()} disabled={busy}>
        {busy ? "Opening…" : "Manage billing"}
      </Button>
      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
