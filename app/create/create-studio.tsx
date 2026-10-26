"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LivePreview } from "@/components/editor/live-preview";
import { Button } from "@/components/ui/button";
import { encodeHandoff, firstPromptKey } from "@/lib/editor/first-prompt";
import { track } from "@/lib/monitoring/analytics";
import { STARTER_ORDER, STARTERS, type StarterId } from "@/lib/projects/starters";
import { cn } from "@/lib/utils/cn";
import { ChatPanel, type Credits, type ModelOption } from "../edit/[id]/chat-panel";

const IDEAS = [
  "A booking page for a barbershop with prices and opening hours",
  "A countdown page for my album release, neon and dark",
  "A tip calculator that splits the bill between friends",
  "A menu site for a taco truck with a map link",
  "A portfolio for my photography with a dark gallery grid",
];

const SWATCH: Record<StarterId, string> = {
  blank: "bg-[linear-gradient(135deg,#f6f5f2,#d9d6cf)]",
  landing: "bg-[linear-gradient(135deg,#3b5bfd,#9db0ff)]",
  portfolio: "bg-[linear-gradient(135deg,#e9d8c8,#a596c4)]",
  links: "bg-[linear-gradient(135deg,#7c5cff,#2ec5ff)]",
  app: "bg-[linear-gradient(135deg,#1f6feb,#7ee0c3)]",
};

/** The blank page is offered as a "canvas"; the rest are inspiration to start from. */
const LABEL: Partial<Record<StarterId, { name: string; blurb: string }>> = {
  blank: {
    name: "Blank canvas",
    blurb: "Nothing to undo. Describe anything and build it from scratch.",
  },
};

export type CreateData = {
  models: ModelOption[];
  credits: Credits;
  ai: { allowed: true } | { allowed: false; reason: string };
  previewOrigin: string;
};

/**
 * Create, laid out like the remix editor: the prompt on the left, a live preview in the middle
 * and inspiration on the side. Nothing is saved until the person sends a prompt or opens the
 * editor; then a private draft is made from the chosen starting point.
 */
export function CreateStudio({ data }: { data: CreateData }) {
  const router = useRouter();
  const [starter, setStarter] = useState<StarterId>("blank");
  const [busy, setBusy] = useState<null | "ai" | "save">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [mobileTab, setMobileTab] = useState<"chat" | "preview" | "inspiration">("chat");
  const files = STARTERS[starter].files;
  const label = (id: StarterId) => LABEL[id] ?? STARTERS[id];

  async function start(prompt: string | null, modelId?: string, images?: { base64: string }[]) {
    setBusy(prompt ? "ai" : "save");
    setNotice(null);
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starter, idea: prompt ?? undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setNotice(json.error ?? "That didn't work. Try again.");
        setBusy(null);
        return;
      }
      track("project_created", { starter });
      if (prompt) {
        const key = firstPromptKey(json.id);
        try {
          // The editor sends it as soon as it opens, with the same model and images.
          sessionStorage.setItem(key, encodeHandoff({ prompt, send: true, modelId, images }));
        } catch {
          // Too big to hand over with its images (or storage is blocked): hand over the words
          // only, waiting in the prompt box, so nothing is sent without the images.
          try {
            sessionStorage.setItem(key, encodeHandoff({ prompt, send: false }));
          } catch {
            // Nothing more to do: the editor opens with an empty prompt.
          }
        }
      }
      router.push(`/edit/${json.id}`);
    } catch {
      setNotice("That didn't work. Check your connection and try again.");
      setBusy(null);
    }
  }

  const inspiration = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex h-11 shrink-0 items-center border-b px-4">
        <h2 id="inspiration-heading" className="text-sm font-bold">
          Inspiration
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="text-muted px-1 pb-3 text-sm">
          Start from a blank canvas or a starter. Your prompt builds on whichever you pick.
        </p>
        <div
          role="radiogroup"
          aria-labelledby="inspiration-heading"
          className="flex flex-col gap-2"
        >
          {STARTER_ORDER.map((id) => {
            const on = starter === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setStarter(id);
                  setMobileTab((t) => (t === "inspiration" ? "preview" : t));
                }}
                className={cn(
                  "group flex gap-3 rounded-[var(--radius-control)] border p-2.5 text-left transition-colors",
                  on
                    ? "border-magenta bg-magenta/10"
                    : "border-line bg-panel hover:border-line-strong",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-14 w-16 shrink-0 rounded-md transition-transform group-hover:scale-[1.04]",
                    SWATCH[id],
                    id === "blank" && "border-line-strong border border-dashed",
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-fg text-sm font-semibold">{label(id).name}</span>
                  <span className="text-muted text-xs leading-snug">{label(id).blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[520px] flex-col">
      <header className="border-line flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/drafts"
            className="text-muted hover:text-fg shrink-0 text-sm"
            aria-label="Back to your drafts"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold sm:text-base">New project</h1>
            <p className="text-faint truncate text-xs">
              Starting from {label(starter).name.toLowerCase()} · a private draft until you publish
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void start(null)}
          disabled={busy !== null}
          title="Open this starting point in the editor without asking the AI"
        >
          {busy === "save" ? "Opening…" : "Edit by hand"}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Describe your project"
          className={cn(
            "border-line min-h-0 w-full flex-col lg:flex lg:w-[400px] lg:shrink-0 lg:border-r",
            mobileTab === "chat" ? "flex" : "hidden",
          )}
        >
          <ChatPanel
            items={[]}
            proposal={null}
            models={data.models}
            credits={data.credits}
            inputChars={Object.values(files).reduce((n, t) => n + t.length, 0)}
            ai={data.ai}
            busy={busy}
            onAsk={(prompt, modelId, images) => void start(prompt, modelId, images)}
            onAccept={() => {}}
            onDiscard={() => {}}
            onToggleFile={() => {}}
            onUndo={() => {}}
            currentVersionId=""
            projectId="new"
            intro={{
              title: "What do you want to make?",
              body: "Describe it in plain words and the AI builds the first version. You'll review every change, and you can keep editing by hand or by asking for more.",
              suggestions: IDEAS,
            }}
            placeholder={`Describe your project, e.g. “${STARTERS[starter].idea}”`}
            sendLabel="Create"
          />
        </aside>

        <section
          aria-label="Preview"
          className={cn(
            "min-w-0 flex-1 flex-col lg:flex",
            mobileTab === "preview" ? "flex" : "hidden",
          )}
        >
          <div className="border-line flex h-11 shrink-0 items-center justify-between gap-2 border-b px-2 sm:px-3">
            <span className="bg-panel-raised text-fg h-8 rounded-lg px-3 text-sm leading-8 font-semibold">
              Preview
            </span>
            <div className="flex items-center gap-1">
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "hidden h-8 rounded-lg px-3 text-sm font-semibold lg:block",
                    device === d ? "bg-panel-raised text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {d === "desktop" ? "Desktop" : "Phone"}
                </button>
              ))}
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
              <LivePreview
                previewOrigin={data.previewOrigin}
                entryPath="index.html"
                text={files}
                assets={{}}
                device={device}
                page="index.html"
                onNavigate={() => {}}
              />
            </div>
          </div>
        </section>

        <aside
          aria-label="Inspiration"
          className={cn(
            "border-line min-h-0 w-full flex-col xl:flex xl:w-80 xl:shrink-0 xl:border-l",
            mobileTab === "inspiration" ? "flex lg:hidden" : "hidden",
          )}
        >
          {inspiration}
        </aside>
      </div>

      {/* Below xl the inspiration panel is a tab: on phones next to Chat and Preview, on
          tablets/laptops as a strip under the header. */}
      <div className="border-line hidden shrink-0 gap-2 overflow-x-auto border-t px-3 py-2 lg:flex xl:hidden">
        {STARTER_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={starter === id}
            onClick={() => setStarter(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
              starter === id
                ? "border-magenta bg-magenta/10 text-fg"
                : "border-line text-muted hover:text-fg",
            )}
          >
            <span aria-hidden className={cn("size-4 rounded-full", SWATCH[id])} />
            {label(id).name}
          </button>
        ))}
      </div>

      <nav
        aria-label="Create views"
        className="border-line bg-ink grid h-14 shrink-0 grid-cols-3 border-t lg:hidden"
      >
        {(["chat", "preview", "inspiration"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={mobileTab === t}
            onClick={() => setMobileTab(t)}
            className={cn(
              "text-sm font-semibold capitalize",
              mobileTab === t ? "text-fg" : "text-faint",
            )}
          >
            {t === "chat" ? "Describe" : t}
          </button>
        ))}
      </nav>

      {notice ? (
        <div
          role="alert"
          className="border-danger/50 bg-panel text-fg fixed bottom-20 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[var(--radius-control)] border px-4 py-3 text-sm shadow-2xl lg:bottom-6"
        >
          {notice}
        </div>
      ) : null}
    </div>
  );
}
