"use client";

import { useState } from "react";
import { deleteDraftAction } from "@/app/actions/editor";

/** Two-step delete: drafts can't be recovered, so ask once more first. */
export function DeleteDraftButton({ projectId }: { projectId: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-faint hover:text-danger text-sm underline-offset-4 hover:underline"
      >
        Delete
      </button>
    );
  }
  return (
    <form action={deleteDraftAction} className="flex items-center gap-2 text-sm">
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        className="text-danger font-semibold underline-offset-4 hover:underline"
      >
        Delete forever
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted hover:text-fg"
      >
        Keep
      </button>
    </form>
  );
}
