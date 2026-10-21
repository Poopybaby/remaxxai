"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";

export function UserMenu({
  handle,
  displayName,
  avatarUrl,
}: {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "block w-full rounded-lg px-3 py-2 text-left text-[15px] text-muted hover:bg-panel-raised hover:text-fg";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-panel flex items-center gap-2 rounded-full p-0.5"
      >
        <Avatar name={displayName} handle={handle} src={avatarUrl} size={34} />
        <span className="sr-only">Account menu for @{handle}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="border-line bg-panel absolute right-0 z-50 mt-2 w-56 rounded-[var(--radius-card)] border p-1.5 shadow-2xl shadow-black/50"
        >
          <div className="px-3 pt-2 pb-2.5">
            <p className="text-fg truncate font-semibold">{displayName}</p>
            <p className="text-faint truncate text-sm">@{handle}</p>
          </div>
          <Link
            role="menuitem"
            href={`/u/${handle}`}
            className={item}
            onClick={() => setOpen(false)}
          >
            Your profile
          </Link>
          <Link role="menuitem" href="/settings" className={item} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <form action={signOut}>
            <button role="menuitem" type="submit" className={item}>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
