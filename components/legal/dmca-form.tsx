"use client";

import { useActionState } from "react";
import { dmcaAction, type ReportState } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";

export function DmcaForm() {
  const [state, action, pending] = useActionState<ReportState, FormData>(dmcaAction, {
    status: "idle",
    message: "",
  });

  const v = state.values ?? {};

  if (state.status === "sent") {
    return (
      <p
        role="status"
        className="not-prose border-success/40 bg-success/10 text-fg rounded-[var(--radius-control)] border px-4 py-3"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form
      action={action}
      className="not-prose border-line bg-panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-5"
    >
      <Field id="dmca-link" label="Link to the project on REMAXX">
        <Input
          id="dmca-link"
          name="link"
          defaultValue={v.link}
          required
          placeholder="https://remaxx.ai/p/..."
        />
      </Field>
      <Field
        id="dmca-work"
        label="Your original work"
        hint="Describe it, and link to it if it's online."
      >
        <Textarea
          id="dmca-work"
          name="work"
          defaultValue={v.work}
          required
          minLength={10}
          maxLength={1200}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="dmca-name" label="Your full name">
          <Input id="dmca-name" name="name" defaultValue={v.name} required autoComplete="name" />
        </Field>
        <Field id="dmca-email" label="Email">
          <Input
            id="dmca-email"
            name="email"
            defaultValue={v.email}
            type="email"
            required
            autoComplete="email"
          />
        </Field>
      </div>
      <Field id="dmca-address" label="Postal address and phone number">
        <Input
          id="dmca-address"
          name="address"
          defaultValue={v.address}
          required
          autoComplete="street-address"
        />
      </Field>
      <Field id="dmca-signature" label="Electronic signature" hint="Type your full name.">
        <Input id="dmca-signature" name="signature" defaultValue={v.signature} required />
      </Field>
      <CheckboxField id="dmca-swear" name="swear" defaultChecked={v.swear === "on"}>
        I believe in good faith that this use isn&apos;t authorized by the copyright owner, its
        agent, or the law. The information in this notice is accurate, and under penalty of perjury,
        I am the copyright owner or authorized to act on their behalf.
      </CheckboxField>
      {state.status === "error" ? (
        <p role="alert" className="text-danger text-sm">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Sending…" : "Send notice"}
      </Button>
    </form>
  );
}
