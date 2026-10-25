"use client";

import Link from "next/link";
import { useActionState } from "react";
import { remixAction, type RemixState } from "@/app/actions/editor";
import { buttonClasses } from "@/components/ui/button";
import { track } from "@/lib/monitoring/analytics";

/** Makes a private draft copy of the project and opens it in the editor. */
export function RemixButton({
  projectId,
  slug,
  signedIn,
}: {
  projectId: string;
  slug: string;
  signedIn: boolean;
}) {
  const [state, action, pending] = useActionState<RemixState, FormData>(remixAction, {
    error: null,
  });
  if (!signedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/p/${slug}`)}`}
        className={buttonClasses("primary")}
      >
        Remix
      </Link>
    );
  }
  return (
    <form
      action={action}
      onSubmit={() => track("remix_started", {})}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="returnTo" value={`/p/${slug}`} />
      <button type="submit" disabled={pending} className={buttonClasses("primary")}>
        {pending ? "Making your copy…" : "Remix"}
      </button>
      {state.error ? (
        <p role="alert" className="text-danger max-w-[28ch] text-right text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
