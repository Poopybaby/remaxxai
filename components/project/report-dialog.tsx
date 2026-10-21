"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { reportAction, type ReportState } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

const REASONS = [
  ["copyright", "It copies my work or someone else's (copyright)"],
  ["leaked_code", "It contains leaked or proprietary code"],
  ["malware", "It runs malware or a crypto-miner"],
  ["phishing", "It's a fake login or payment page"],
  ["sexual", "Sexual content"],
  ["hate", "Hate or harassment"],
  ["spam", "Spam or misleading"],
  ["other", "Something else"],
] as const;

export function ReportButton({ projectId, signedIn }: { projectId: string; signedIn: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ReportState, FormData>(reportAction, {
    status: "idle",
    message: "",
  });

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="text-faint hover:text-fg text-sm underline-offset-4 hover:underline"
      >
        Report
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="text-faint hover:text-fg text-sm underline-offset-4 hover:underline"
      >
        Report
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="report-title"
        className="border-line bg-panel text-fg m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border p-0 backdrop:bg-black/70"
      >
        {state.status === "sent" ? (
          <div className="flex flex-col gap-4 p-6">
            <h2 id="report-title" className="text-xl font-bold">
              Report sent
            </h2>
            <p className="text-muted">{state.message}</p>
            <Button variant="secondary" onClick={() => dialog.current?.close()} className="w-fit">
              Close
            </Button>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-5 p-6">
            <input type="hidden" name="projectId" value={projectId} />
            <h2 id="report-title" className="text-xl font-bold">
              Report this project
            </h2>
            <Field id="reason" label="What's wrong?">
              <Select id="reason" name="reason" required defaultValue={state.values?.reason ?? ""}>
                <option value="" disabled>
                  Choose a reason
                </option>
                {REASONS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="details" label="Details (optional)">
              <Textarea
                id="details"
                name="details"
                maxLength={2000}
                defaultValue={state.values?.details}
              />
            </Field>
            <p className="text-faint text-sm">
              Copyright owner? A formal notice through the{" "}
              <Link href="/legal/dmca" className="underline underline-offset-4">
                DMCA form
              </Link>{" "}
              is handled first.
            </p>
            {state.status === "error" ? (
              <p role="alert" className="text-danger text-sm">
                {state.message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
