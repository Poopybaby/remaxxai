import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const card =
  "border-line bg-panel/70 flex flex-col gap-3 rounded-[var(--radius-card)] border p-6 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-1 hover:border-line-strong hover:bg-panel motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-magenta text-sm font-bold tracking-[0.12em] uppercase">{children}</p>;
}

/** What REMAXX is, in one breath. */
export function WhatItIs() {
  return (
    <section
      aria-labelledby="what-heading"
      className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-24"
    >
      <div className="flex flex-col gap-3">
        <Eyebrow>What is REMAXX</Eyebrow>
        <h2 id="what-heading" className="type-wide text-4xl font-black text-balance sm:text-5xl">
          A gallery you can edit.
        </h2>
      </div>
      <div className="text-muted flex flex-col gap-5 text-lg leading-relaxed">
        <p>
          REMAXX is a community gallery of websites, tools and UI kits built with AI, with an AI
          editor built right in. Find something you love, describe what you&apos;d change, and make
          it yours. No setup, no installs, no blank-page panic.
        </p>
        <p>
          <span className="text-fg font-semibold">Our goal</span> is to make building with AI feel
          less like staring at an empty page and more like jamming on something you already like.
          It&apos;s the easiest way into vibe coding, and a fair one for the people who share their
          work.
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Find",
    body: "Browse the gallery or search by vibe: “dark glassy fintech dashboard”, “playful pastel booking site”. Every result tells you why it matched.",
    accent: "text-cyan",
  },
  {
    n: "02",
    title: "Remix",
    body: "Open it in the editor and say what you want changed, by typing or talking. The AI edits the code, the preview updates live, and you review every change before it's kept.",
    accent: "text-magenta",
  },
  {
    n: "03",
    title: "Publish",
    body: "Share your version under your name. Credit to everyone it's built on is added automatically, and the next person can remix yours.",
    accent: "text-success",
  },
];

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-heading"
      className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-24"
    >
      <div className="flex flex-col gap-3">
        <Eyebrow>How it works</Eyebrow>
        <h2 id="how-heading" className="type-wide text-4xl font-black text-balance sm:text-5xl">
          Find it. Remix it. Ship it.
        </h2>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className={card}>
            <span className={cn("type-wide text-5xl font-black", s.accent)} aria-hidden>
              {s.n}
            </span>
            <h3 className="text-fg text-xl font-bold">{s.title}</h3>
            <p className="text-muted leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="text-muted">
        Rather start fresh?{" "}
        <Link href="/create" className="text-fg font-semibold underline underline-offset-4">
          Create
        </Link>{" "}
        opens the same editor with a blank canvas and a few starters for inspiration.
      </p>
    </section>
  );
}

const REASONS = [
  {
    title: "Learn by changing things",
    body: "The quickest way to understand how something is built is to change it. “Break it down” explains any project's stack and logic in plain English.",
  },
  {
    title: "Credit where it's due",
    body: "Every remix carries its full credit chain. Creators get seen, and followed, every time someone builds on their work.",
  },
  {
    title: "Clean licenses, no clones",
    body: "Everything here was shared on purpose, under a license its creator chose. No cloned commercial apps, no leaked code.",
  },
  {
    title: "Safe by design",
    body: "Projects run in a sandbox, walled off from your account. AI keys stay on our servers, never in your browser.",
  },
  {
    title: "Pay for what you use",
    body: "Browsing, editing by hand and publishing are free. AI edits use credits, and you see the cost before you send.",
  },
  {
    title: "No setup",
    body: "Everything happens in the browser. No installs, no terminal, no accounts with five other tools.",
  },
];

export function WhyRemaxx() {
  return (
    <section
      aria-labelledby="why-heading"
      className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-24"
    >
      <div className="flex flex-col gap-3">
        <Eyebrow>Why REMAXX</Eyebrow>
        <h2 id="why-heading" className="type-wide text-4xl font-black text-balance sm:text-5xl">
          Built for making things, and for the people who share them.
        </h2>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REASONS.map((r) => (
          <li key={r.title} className={card}>
            <h3 className="text-fg text-lg font-bold">{r.title}</h3>
            <p className="text-muted leading-relaxed">{r.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const AUDIENCES = [
  {
    who: "New to vibe coding",
    what: "Start from something that already works and change one thing at a time. You'll see exactly what the AI did.",
  },
  {
    who: "Side-hustlers",
    what: "Get a head start on landing pages, booking sites and small tools you can launch this week.",
  },
  {
    who: "Template creators",
    what: "Share your work, get credited on every remix, and build a following of people who like your style.",
  },
  {
    who: "Designers",
    what: "Browse by look and feel, not by framework. Turn a vibe into a working page without handing it off.",
  },
];

export function ForWho() {
  return (
    <section
      aria-labelledby="who-heading"
      className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-24"
    >
      <div className="flex flex-col gap-3">
        <Eyebrow>Who it&apos;s for</Eyebrow>
        <h2 id="who-heading" className="type-wide text-4xl font-black text-balance sm:text-5xl">
          Anyone with an idea and a browser.
        </h2>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map((a) => (
          <li key={a.who} className={card}>
            <h3 className="text-fg text-lg font-bold">{a.who}</h3>
            <p className="text-muted leading-relaxed">{a.what}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClosingCta({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="closing-heading"
      className="mx-auto w-full max-w-7xl px-4 pt-8 pb-24 sm:px-6"
    >
      <div className="border-line relative flex flex-col items-start gap-6 overflow-hidden rounded-[var(--radius-card)] border bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--color-magenta)_22%,transparent),transparent_60%),radial-gradient(ellipse_at_bottom_left,color-mix(in_oklab,var(--color-cyan)_14%,transparent),transparent_55%)] p-8 sm:p-12">
        <h2
          id="closing-heading"
          className="type-wide max-w-[18ch] text-4xl font-black text-balance sm:text-5xl"
        >
          Your next project is one remix away.
        </h2>
        {children}
      </div>
    </section>
  );
}
