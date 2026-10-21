"use client";

import { useActionState } from "react";
import { updateProfileAction, type FormState } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

const initial: FormState = { errors: {} };

export function ProfileSettingsForm(props: {
  displayName: string;
  bio: string;
  websiteUrl: string;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, initial);
  const e = state.errors;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Field id="displayName" label="Display name" error={e.displayName}>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={props.displayName}
          maxLength={50}
          required
          aria-invalid={e.displayName ? true : undefined}
          aria-describedby={e.displayName ? "displayName-error" : undefined}
        />
      </Field>
      <Field id="bio" label="Bio" error={e.bio} hint="Up to 280 characters. Shown on your profile.">
        <Textarea
          id="bio"
          name="bio"
          defaultValue={props.bio}
          maxLength={280}
          aria-invalid={e.bio ? true : undefined}
          aria-describedby={e.bio ? "bio-error" : "bio-hint"}
        />
      </Field>
      <Field id="websiteUrl" label="Website" error={e.websiteUrl}>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={props.websiteUrl}
          aria-invalid={e.websiteUrl ? true : undefined}
          aria-describedby={e.websiteUrl ? "websiteUrl-error" : undefined}
        />
      </Field>

      {e.form ? (
        <p role="alert" className="text-danger text-sm">
          {e.form}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {state.saved && !pending ? (
          <p role="status" className="text-success text-sm">
            Profile saved.
          </p>
        ) : null}
      </div>
    </form>
  );
}
