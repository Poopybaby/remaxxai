"use client";

import { useActionState } from "react";
import { adjustCreditsAction, type AdjustState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const initial: AdjustState = { message: null, error: false };

export function AdjustCreditsForm() {
  const [state, action, pending] = useActionState(adjustCreditsAction, initial);
  return (
    <form
      action={(fd) => {
        fd.set("requestId", crypto.randomUUID());
        return action(fd);
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_2fr_auto]">
        <label className="sr-only" htmlFor="adj-handle">
          Handle
        </label>
        <Input id="adj-handle" name="handle" placeholder="@handle" required autoComplete="off" />
        <label className="sr-only" htmlFor="adj-delta">
          Credits (negative to remove)
        </label>
        <Input
          id="adj-delta"
          name="delta"
          type="number"
          step={1}
          placeholder="+500"
          required
          inputMode="numeric"
        />
        <label className="sr-only" htmlFor="adj-note">
          Why
        </label>
        <Input
          id="adj-note"
          name="note"
          placeholder="Why (shown in the ledger)"
          maxLength={200}
          required
        />
        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="h-10">
          {pending ? "Saving…" : "Apply"}
        </Button>
      </div>
      {state.message ? (
        <p role="status" className={state.error ? "text-danger text-sm" : "text-success text-sm"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
