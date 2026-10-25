"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { firstPromptKey } from "@/lib/editor/first-prompt";
import { STARTER_ORDER, STARTERS, type StarterId } from "@/lib/projects/starters";
import { cn } from "@/lib/utils/cn";
import { track } from "@/lib/monitoring/analytics";

const IDEAS = [
  "A booking page for a barbershop with prices and opening hours",
  "A countdown page for my album release, neon and dark",
  "A tip calculator that splits the bill between friends",
  "A menu site for a taco truck with a map link",
];

const SWATCH: Record<StarterId, string> = {
  blank: "bg-[linear-gradient(135deg,#f6f5f2,#d9d6cf)]",
  landing: "bg-[linear-gradient(135deg,#3b5bfd,#9db0ff)]",
  portfolio: "bg-[linear-gradient(135deg,#e9d8c8,#a596c4)]",
  links: "bg-[linear-gradient(135deg,#7c5cff,#2ec5ff)]",
  app: "bg-[linear-gradient(135deg,#1f6feb,#7ee0c3)]",
};

export function CreateForm({ aiAllowed }: { aiAllowed: boolean }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [starter, setStarter] = useState<StarterId>("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starter, idea: idea.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setError(json.error ?? "That didn't work. Try again.");
        setBusy(false);
        return;
      }
      track("project_created", { starter });
      if (aiAllowed && idea.trim()) {
        try {
          sessionStorage.setItem(firstPromptKey(json.id), idea.trim());
        } catch {
          // Storage blocked: the editor just opens with an empty prompt.
        }
      }
      router.push(`/edit/${json.id}`);
    } catch {
      setError("That didn't work. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-10">
      <section aria-labelledby="idea-heading" className="flex flex-col gap-3">
        <h2 id="idea-heading" className="text-fg text-lg font-bold">
          What do you want to make?
        </h2>
        {aiAllowed ? (
          <>
            <label htmlFor="idea" className="sr-only">
              Describe your project
            </label>
            <Textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={STARTERS[starter].idea}
            />
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setIdea(x)}
                  className="border-line text-muted hover:border-line-strong hover:text-fg rounded-full border px-3 py-1.5 text-left text-sm"
                >
                  {x}
                </button>
              ))}
            </div>
            <p className="text-faint text-sm">
              Your description is waiting in the editor&apos;s chat. You&apos;ll see the credit cost
              before anything is sent.
            </p>
          </>
        ) : (
          <p className="border-line bg-panel text-muted rounded-[var(--radius-control)] border px-4 py-3 text-sm">
            Building with AI is in early access. Pick a starter below and edit the code yourself;
            the live preview updates as you type.
          </p>
        )}
      </section>

      <section aria-labelledby="starter-heading" className="flex flex-col gap-3">
        <h2 id="starter-heading" className="text-fg text-lg font-bold">
          Start from
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="starter-heading"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {STARTER_ORDER.map((id) => {
            const s = STARTERS[id];
            const on = starter === id;
            return (
              <label
                key={id}
                className={cn(
                  "flex cursor-pointer flex-col gap-3 rounded-[var(--radius-card)] border p-3 transition-colors",
                  on
                    ? "border-magenta bg-magenta/10"
                    : "border-line bg-panel hover:border-line-strong",
                )}
              >
                <span aria-hidden className={cn("h-20 rounded-[10px]", SWATCH[id])} />
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="starter"
                    value={id}
                    checked={on}
                    onChange={() => setStarter(id)}
                    className="accent-magenta"
                  />
                  <span className="text-fg font-semibold">{s.name}</span>
                </span>
                <span className="text-muted text-sm">{s.blurb}</span>
              </label>
            );
          })}
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}

      <div className="border-line flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-faint text-sm">
          It starts as a private draft. Only you can see it until you publish.
        </p>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Setting up…" : "Start creating"}
        </Button>
      </div>
    </form>
  );
}
