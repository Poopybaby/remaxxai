"use client";

import { useActionState } from "react";
import { joinWaitlistAction, type WaitlistState } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const initial: WaitlistState = { status: "idle", message: "" };

export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlistAction, initial);

  if (state.status === "success") {
    return (
      <p
        role="status"
        className="border-success/40 bg-success/10 text-fg rounded-[var(--radius-control)] border px-4 py-3"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-2" noValidate>
      <label htmlFor="waitlist-email" className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          placeholder="you@example.com"
          aria-invalid={state.status === "error" ? true : undefined}
          aria-describedby={state.status === "error" ? "waitlist-error" : undefined}
          className="h-12 sm:flex-1"
        />
        <Button type="submit" size="lg" disabled={pending} className="h-12">
          {pending ? "Joining…" : "Join the waitlist"}
        </Button>
      </div>
      {state.status === "error" ? (
        <p id="waitlist-error" role="alert" className="text-danger text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
