"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";

/**
 * "Break it down" on a project page: a plain-English walkthrough of how the project works.
 * Shows the saved write-up if one exists; otherwise signed-in people can ask for one.
 */
export function BreakItDown({
  versionId,
  initial,
  signedIn,
  slug,
}: {
  versionId: string;
  initial: string | null;
  signedIn: boolean;
  slug: string;
}) {
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function generate() {
    setOpen(true);
    if (text) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const body = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
      if (!res.ok || !body.content) {
        setStatus("error");
        setError(body.error ?? "That didn't work. Try again.");
        return;
      }
      setText(body.content);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("You seem to be offline.");
    }
  }

  return (
    <section
      aria-labelledby="breakdown-heading"
      className="border-line flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="breakdown-heading" className="font-bold">
            Break it down
          </h2>
          <p className="text-muted text-sm">
            A plain-English tour of how this project is built and how it works.
          </p>
        </div>
        {open && text ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Hide
          </Button>
        ) : signedIn || text ? (
          <Button variant="secondary" size="sm" onClick={generate} disabled={status === "loading"}>
            {text
              ? "Show the breakdown"
              : status === "loading"
                ? "Reading the code…"
                : "Break it down"}
          </Button>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/p/${slug}`)}`}
            className="text-muted hover:text-fg text-sm underline underline-offset-4"
          >
            Sign in to break it down
          </Link>
        )}
      </div>
      {status === "error" ? (
        <p role="alert" className="text-fg text-sm">
          {error}
        </p>
      ) : null}
      {open && text ? (
        <Markdown text={text} className="text-muted border-line border-t pt-2 text-[15px]" />
      ) : null}
    </section>
  );
}
