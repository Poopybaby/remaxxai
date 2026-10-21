"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { followAction, likeAction, saveAction, visibilityAction } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type Toggle = (
  id: string,
  active: boolean,
) => Promise<{ ok: true; active: boolean; count: number } | { ok: false; error: string }>;

function useToggle(action: Toggle, id: string, initial: { active: boolean; count: number }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function toggle() {
    const next = !state.active;
    const previous = state;
    setState({ active: next, count: Math.max(0, state.count + (next ? 1 : -1)) });
    setError(null);
    start(async () => {
      const res = await action(id, next);
      if (res.ok) setState({ active: res.active, count: res.count });
      else {
        setState(previous);
        setError(res.error);
      }
    });
  }
  return { state, error, pending, toggle };
}

export function LikeSaveButtons({
  projectId,
  signedIn,
  liked,
  saved,
  likeCount,
  saveCount,
}: {
  projectId: string;
  signedIn: boolean;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  saveCount: number;
}) {
  const like = useToggle(likeAction, projectId, { active: liked, count: likeCount });
  const save = useToggle(saveAction, projectId, { active: saved, count: saveCount });

  if (!signedIn) {
    return (
      <div className="flex gap-2">
        <Link
          href="/login"
          className="border-line-strong bg-panel hover:bg-panel-raised inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border px-4 text-[15px] font-semibold"
        >
          Like <span className="text-muted">{likeCount}</span>
        </Link>
        <Link
          href="/login"
          className="border-line-strong bg-panel hover:bg-panel-raised inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border px-4 text-[15px] font-semibold"
        >
          Save
        </Link>
      </div>
    );
  }

  const error = like.error ?? save.error;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          aria-pressed={like.state.active}
          onClick={like.toggle}
          disabled={like.pending}
          className={cn(like.state.active && "border-magenta text-fg")}
        >
          <svg
            viewBox="0 0 20 20"
            className={cn(
              "size-4",
              like.state.active ? "fill-magenta" : "fill-none stroke-current",
            )}
            strokeWidth="1.6"
            aria-hidden
          >
            <path d="M10 17.3 8.8 16.2C4.6 12.4 2 10 2 7.1 2 4.7 3.9 2.8 6.3 2.8c1.4 0 2.7.6 3.7 1.7 1-1.1 2.3-1.7 3.7-1.7 2.4 0 4.3 1.9 4.3 4.3 0 2.9-2.6 5.3-6.8 9.1L10 17.3z" />
          </svg>
          {like.state.active ? "Liked" : "Like"}{" "}
          <span className="text-muted">{like.state.count}</span>
        </Button>
        <Button
          variant="secondary"
          aria-pressed={save.state.active}
          onClick={save.toggle}
          disabled={save.pending}
          className={cn(save.state.active && "border-cyan text-fg")}
        >
          {save.state.active ? "Saved" : "Save"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FollowButton({
  userId,
  following,
  followers,
  signedIn,
  size = "sm",
}: {
  userId: string;
  following: boolean;
  followers: number;
  signedIn: boolean;
  size?: "sm" | "md";
}) {
  const follow = useToggle(followAction, userId, { active: following, count: followers });
  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="border-line-strong hover:bg-panel inline-flex h-9 items-center rounded-[var(--radius-control)] border px-3 text-sm font-semibold"
      >
        Follow
      </Link>
    );
  }
  return (
    <Button
      variant={follow.state.active ? "secondary" : "primary"}
      size={size}
      aria-pressed={follow.state.active}
      onClick={follow.toggle}
      disabled={follow.pending}
    >
      {follow.state.active ? "Following" : "Follow"}
    </Button>
  );
}

export function VisibilityToggle({
  projectId,
  published,
}: {
  projectId: string;
  published: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await visibilityAction(projectId, published ? "unpublished" : "published");
            if (!res.ok) setError(res.error);
          })
        }
      >
        {published ? "Hide from gallery" : "Publish again"}
      </Button>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
