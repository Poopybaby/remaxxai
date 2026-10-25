import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FREE_TRIAL_PROMPTS, isPlanId, PLANS } from "@/config/plans";
import { ButtonLink } from "@/components/ui/button";
import { getEntitlement, recentLedger } from "@/lib/billing/credits";
import { salesState } from "@/lib/billing/sales";
import { getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { cn } from "@/lib/utils/cn";
import { ManageBillingButton } from "./manage-button";

export const metadata: Metadata = { title: "Billing and credits", robots: { index: false } };

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);
const fmtWhen = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);

function describe(kind: string, meta: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  switch (kind) {
    case "subscription_grant":
      if (isPlanId(m.to)) return `Upgrade to ${PLANS[m.to].name}`;
      return `Monthly credits${isPlanId(m.plan) ? ` (${PLANS[m.plan].name})` : ""}`;
    case "topup":
      return "Credits added";
    case "spend":
      return "AI request";
    case "refund":
      return "Refund for a failed request";
    case "expiry":
      return "Unused credits expired";
    case "admin_adjust":
      return "Adjustment by REMAXX";
    case "trial_grant":
      return "Free prompts";
    default:
      return kind;
  }
}

export default function BillingPage({ searchParams }: PageProps<"/billing">) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <h1 className="type-wide text-4xl font-black">Billing and credits</h1>
      <Suspense
        fallback={<div className="bg-panel h-80 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <Billing searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Billing({ searchParams }: Pick<PageProps<"/billing">, "searchParams">) {
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect("/login?next=/billing");
  if (ctx.status === "needs_onboarding") redirect("/onboarding?next=/billing");
  if (!isDbConfigured()) redirect("/");
  const checkout = (await searchParams).checkout;
  const db = getDb();
  const [ent, ledger] = await Promise.all([
    getEntitlement(db, ctx.userId),
    recentLedger(db, ctx.userId, 30),
  ]);
  const sales = salesState({ userId: ctx.userId, role: ctx.profile.role });

  return (
    <div className="flex flex-col gap-8">
      {checkout === "success" || checkout === "changed" ? (
        <p
          role="status"
          className="border-success/40 bg-success/10 rounded-[var(--radius-control)] border px-4 py-3 text-sm"
        >
          <strong className="text-fg">
            {checkout === "success" ? "Thanks, you're subscribed." : "Your plan was changed."}
          </strong>{" "}
          <span className="text-muted">
            Credits usually arrive within a few seconds. Refresh if they aren&apos;t here yet.
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-line bg-panel flex flex-col gap-1 rounded-[var(--radius-card)] border p-5">
          <p className="text-faint text-sm">Credits</p>
          <p className="text-4xl font-black tabular-nums">{ent.balance.toLocaleString("en-US")}</p>
          <p className="text-muted text-sm">
            {ent.trialPrompts > 0
              ? `Plus ${ent.trialPrompts} of ${FREE_TRIAL_PROMPTS} free prompts left.`
              : ent.plan
                ? "Unused credits expire when your billing month ends."
                : "Your free prompts are used up."}
          </p>
        </div>
        <div className="border-line bg-panel flex flex-col gap-1 rounded-[var(--radius-card)] border p-5">
          <p className="text-faint text-sm">Plan</p>
          <p className="text-2xl font-bold">{ent.plan ? ent.plan.name : "Free"}</p>
          <p className="text-muted text-sm">
            {ent.plan && ent.periodEnd
              ? ent.cancelAtPeriodEnd
                ? `Ends on ${fmtDate(ent.periodEnd)}. Your credits go with it.`
                : `${ent.plan.monthlyCredits.toLocaleString("en-US")} credits a month · renews ${fmtDate(ent.periodEnd)}`
              : ent.status === "past_due"
                ? "Your last payment didn't go through. Update your card to keep your plan."
                : "Free prompts only."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ent.plan || ent.status === "past_due" ? <ManageBillingButton /> : null}
            <ButtonLink href="/pricing" size="sm" variant={ent.plan ? "ghost" : "primary"}>
              {ent.plan ? "Change plan" : sales.open ? "See plans" : "See plans (opening soon)"}
            </ButtonLink>
          </div>
        </div>
      </div>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-xl font-bold">
          Credit history
        </h2>
        {ledger.length ? (
          <table className="text-sm">
            <thead className="text-faint text-left">
              <tr>
                <th className="py-1.5 font-normal">When</th>
                <th className="py-1.5 font-normal">What</th>
                <th className="py-1.5 text-right font-normal">Credits</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id} className="border-line border-t">
                  <td className="text-muted py-2 pr-3 whitespace-nowrap">
                    {fmtWhen(row.createdAt)}
                  </td>
                  <td className="py-2 pr-3">{describe(row.kind, row.meta)}</td>
                  <td
                    className={cn(
                      "py-2 text-right tabular-nums",
                      row.delta > 0 ? "text-success" : "text-muted",
                    )}
                  >
                    {row.delta > 0 ? "+" : ""}
                    {row.delta.toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-faint text-sm">
            Nothing yet. AI requests in the{" "}
            <Link href="/drafts" className="hover:text-fg underline">
              editor
            </Link>{" "}
            show up here.
          </p>
        )}
      </section>
    </div>
  );
}
