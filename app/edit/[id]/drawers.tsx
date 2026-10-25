"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import type { VersionSummary } from "@/lib/projects/versions";
import type { ModelOption } from "./chat-panel";

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="bg-ink border-line flex h-full w-full max-w-lg flex-col border-l shadow-2xl outline-none"
      >
        <div className="border-line flex h-14 shrink-0 items-center justify-between border-b px-4">
          <h2 className="font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-sm"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

const when = (d: Date | string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(d),
  );

export function HistoryDrawer({
  versions,
  currentId,
  busy,
  onRestore,
  onClose,
}: {
  versions: VersionSummary[] | null;
  currentId: string;
  busy: boolean;
  onRestore: (v: VersionSummary) => void;
  onClose: () => void;
}) {
  return (
    <Drawer title="Version history" onClose={onClose}>
      <p className="text-muted mb-4 text-sm">
        Every save and accepted AI change is a version. Restoring one makes a new version, so
        nothing is ever lost.
      </p>
      {versions === null ? (
        <p className="text-faint text-sm">Loading…</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {versions.map((v) => (
            <li
              key={v.id}
              className="border-line flex items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
            >
              <div className="min-w-0">
                <p className="text-fg truncate text-sm font-semibold">
                  v{v.number} · {v.message || "Saved"}
                </p>
                <p className="text-faint text-xs">
                  {v.createdBy === "ai" ? "AI edit" : v.createdBy === "system" ? "Remix" : "You"} ·{" "}
                  {when(v.createdAt)}
                </p>
              </div>
              {v.id === currentId ? (
                <span className="text-cyan shrink-0 text-xs font-semibold">Current</span>
              ) : (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRestore(v)}>
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}

export function ExplainDrawer({
  versionId,
  dirty,
  models,
  aiAllowed,
  onClose,
}: {
  versionId: string;
  dirty: boolean;
  models: ModelOption[];
  aiAllowed: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ status: "loading" | "done" | "error"; text: string }>({
    status: "loading",
    text: "",
  });
  const modelId =
    models.find((m) => m.id === "claude-haiku" && m.available)?.id ??
    models.find((m) => m.available)?.id;

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId, modelId }),
    })
      .then(async (r) => ({
        ok: r.ok,
        body: (await r.json().catch(() => ({}))) as { content?: string; error?: string },
      }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        setState(
          ok && body.content
            ? { status: "done", text: body.content }
            : { status: "error", text: body.error ?? "That didn't work. Try again." },
        );
      })
      .catch(() => !cancelled && setState({ status: "error", text: "You seem to be offline." }));
    return () => {
      cancelled = true;
    };
  }, [versionId, modelId]);

  const shown = modelId
    ? state
    : { status: "error" as const, text: "No AI model is set up on this site yet." };
  return (
    <Drawer title="Break it down" onClose={onClose}>
      {dirty ? (
        <p className="text-faint mb-3 text-xs">
          This explains your last saved version. Save to include your latest edits.
        </p>
      ) : null}
      {shown.status === "loading" ? (
        <p className="text-muted flex items-center gap-2 text-sm" role="status">
          <span className="bg-cyan size-2 animate-pulse rounded-full" aria-hidden />
          Reading the code and writing a walkthrough…
        </p>
      ) : shown.status === "error" ? (
        <p className="text-fg text-sm" role="alert">
          {shown.text}
          {!aiAllowed ? " Explanations that already exist still show up here." : ""}
        </p>
      ) : (
        <Markdown text={shown.text} className="text-muted text-[15px]" />
      )}
    </Drawer>
  );
}
