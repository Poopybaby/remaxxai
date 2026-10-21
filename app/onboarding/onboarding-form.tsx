"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createProfileAction, type FormState } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input } from "@/components/ui/field";

const initial: FormState = { errors: {} };

export function OnboardingForm({
  next,
  suggestedName,
  suggestedHandle,
}: {
  next: string;
  suggestedName: string;
  suggestedHandle: string;
}) {
  const [state, action, pending] = useActionState(createProfileAction, initial);
  const e = state.errors;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />

      <Field
        id="handle"
        label="Handle"
        error={e.handle}
        hint="Lowercase letters, numbers and underscores. 3–30 characters."
      >
        <div className="relative">
          <span className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
            @
          </span>
          <Input
            id="handle"
            name="handle"
            defaultValue={state.values?.handle ?? suggestedHandle}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={30}
            className="pl-8"
            aria-invalid={e.handle ? true : undefined}
            aria-describedby={e.handle ? "handle-error" : "handle-hint"}
          />
        </div>
      </Field>

      <Field id="displayName" label="Display name" error={e.displayName}>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={state.values?.displayName ?? suggestedName}
          autoComplete="name"
          required
          maxLength={50}
          aria-invalid={e.displayName ? true : undefined}
          aria-describedby={e.displayName ? "displayName-error" : undefined}
        />
      </Field>

      <div className="border-line bg-panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
        <CheckboxField
          id="ageConfirmed"
          name="ageConfirmed"
          error={e.ageConfirmed}
          defaultChecked={state.values?.ageConfirmed === "on"}
        >
          I&apos;m 18 or older.
        </CheckboxField>
        <CheckboxField
          id="termsAccepted"
          name="termsAccepted"
          error={e.termsAccepted}
          defaultChecked={state.values?.termsAccepted === "on"}
        >
          I agree to the{" "}
          <Link
            href="/legal/terms"
            target="_blank"
            className="text-fg underline underline-offset-4"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/acceptable-use"
            target="_blank"
            className="text-fg underline underline-offset-4"
          >
            Acceptable Use Policy
          </Link>
          , including only uploading work I own or have permission to share.
        </CheckboxField>
      </div>

      {e.form ? (
        <p role="alert" className="text-danger text-sm">
          {e.form}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating profile…" : "Create profile"}
      </Button>
    </form>
  );
}
