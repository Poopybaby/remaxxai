import type { Metadata } from "next";
import { Suspense } from "react";
import { AI_LIMITS } from "@/config/limits";
import { modelOptions } from "@/lib/ai/server";
import { estimateCredits } from "@/lib/billing/estimate";
import { CREDIT_VALUE_USD, FREE_TRIAL_PROMPTS, PLAN_ORDER, PLANS } from "@/config/plans";
import { getEntitlement } from "@/lib/billing/credits";
import { salesState } from "@/lib/billing/sales";
import { getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { cn } from "@/lib/utils/cn";
import { PlanButton } from "./plan-button";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Credits for remixing with Claude, GPT, Gemini and DeepSeek. Start with free prompts.",
};

export default function PricingPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="type-wide text-4xl font-black sm:text-5xl">Pricing</h1>
        <p className="text-muted max-w-[62ch]">
          Browsing, remixing by hand and publishing are free. AI edits use credits, because every
          request costs us money at the AI provider. New accounts get {FREE_TRIAL_PROMPTS} free AI
          prompts, no card needed.
        </p>
      </div>
      <Suspense fallback={<PlanGrid current={null} state={null} signedIn={false} />}>
        <PricingForViewer />
      </Suspense>
      <HowCreditsWork />
    </section>
  );
}

async function PricingForViewer() {
  const ctx = await getViewerContext();
  const viewer = ctx.status === "active" ? { userId: ctx.userId, role: ctx.profile.role } : null;
  const current =
    viewer && isDbConfigured()
      ? ((await getEntitlement(getDb(), viewer.userId)).plan?.id ?? null)
      : null;
  return (
    <PlanGrid current={current} state={salesState(viewer)} signedIn={ctx.status !== "anonymous"} />
  );
}

function PlanGrid({
  current,
  state,
  signedIn,
}: {
  current: string | null;
  state: ReturnType<typeof salesState> | null;
  signedIn: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {state?.open && state.testMode ? (
        <p
          role="note"
          className="border-cyan/40 bg-cyan/10 rounded-[var(--radius-control)] border px-4 py-3 text-sm"
        >
          <strong className="text-fg">Test mode.</strong>{" "}
          <span className="text-muted">
            No real charges. Use card 4242 4242 4242 4242, any future date and any CVC.
          </span>
        </p>
      ) : null}
      {state && !state.open ? (
        <p
          role="note"
          className="border-line bg-panel text-muted rounded-[var(--radius-control)] border px-4 py-3 text-sm"
        >
          {state.reason === "ai_early_access"
            ? "AI editing is in early access, so plans aren't on sale yet. These are the plans we'll open with."
            : "Plans open soon. These are the plans we'll open with."}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const featured = id === "pro";
          const mine = current === id;
          return (
            <article
              key={id}
              className={cn(
                "flex flex-col gap-5 rounded-[var(--radius-card)] border p-6",
                featured ? "border-magenta/60 bg-magenta/5" : "border-line bg-panel",
              )}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">{plan.name}</h2>
                  {mine ? (
                    <span className="bg-success/15 text-success rounded-full px-2.5 py-0.5 text-xs font-semibold">
                      Your plan
                    </span>
                  ) : featured ? (
                    <span className="bg-magenta/15 text-magenta rounded-full px-2.5 py-0.5 text-xs font-semibold">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="text-muted text-sm">{plan.blurb}</p>
              </div>
              <p className="flex items-baseline gap-1">
                <span className="text-4xl font-black">${plan.priceUsdMonthly}</span>
                <span className="text-faint text-sm">/ month</span>
              </p>
              <ul className="text-muted flex flex-1 flex-col gap-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-cyan">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <PlanButton
                planId={id}
                planName={plan.name}
                mine={mine}
                hasPlan={current !== null}
                open={state?.open ?? false}
                signedIn={signedIn}
                featured={featured}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function HowCreditsWork() {
  // Only the models switched on for this site, so the page never promises one that isn't there.
  const live = modelOptions().filter((m) => m.available);
  const top = live.filter((m) => m.tier === "pro").map((m) => m.label);
  return (
    <section
      aria-labelledby="how-heading"
      className="border-line grid gap-6 border-t pt-10 md:grid-cols-3"
    >
      <h2 id="how-heading" className="text-xl font-bold md:col-span-3">
        How credits work
      </h2>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Pay for what you use</h3>
        <p className="text-muted text-sm">
          Each AI request costs credits based on the model and how much it reads and writes. You see
          the estimate before you send.
          {top.length
            ? ` Top models (${top.join(", ")}) cost more per request and need Pro or Power.`
            : ""}{" "}
          One credit is worth ${CREDIT_VALUE_USD.toFixed(2)}.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Never charged for failures</h3>
        <p className="text-muted text-sm">
          If a request errors, times out or comes back unusable, its credits go straight back. When
          you run out, AI requests stop. Nothing is charged beyond your plan.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Monthly, cancel any time</h3>
        <p className="text-muted text-sm">
          Credits arrive each billing month and unused ones don&apos;t roll over. Upgrade mid-month
          and you get the difference right away. Cancel from your billing page.
        </p>
      </div>
      {live.length ? (
        <div className="flex flex-col gap-3 md:col-span-3">
          <h3 className="font-semibold">Models available now</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {live.map((m) => (
              <li
                key={m.id}
                className="border-line bg-panel flex items-center justify-between gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm"
              >
                <span className="flex flex-col">
                  <span className="text-fg font-semibold">{m.label}</span>
                  <span className="text-faint">
                    {m.tier === "pro" ? "Pro and Power" : "Every plan"}
                  </span>
                </span>
                <span className="text-muted text-right tabular-nums">
                  ~{estimateCredits(m, "edit", 8000, AI_LIMITS.edit.maxOutputTokens).typical}{" "}
                  credits
                  <span className="text-faint block text-xs">per small edit</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
