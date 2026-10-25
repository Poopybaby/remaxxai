import Link from "next/link";
import { AI_LIMITS } from "@/config/limits";
import { getModel } from "@/config/models";
import { CREDIT_VALUE_USD, PLAN_ORDER, PLANS } from "@/config/plans";
import { usageToday } from "@/lib/ai/pipeline";
import { aiAccessMode, configuredProviders } from "@/lib/ai/server";
import {
  getModelCosts,
  getOverview,
  getWebhookStatus,
  startOfUtcMonth,
} from "@/lib/admin/dashboard";
import type { Viewer } from "@/lib/auth/permissions";
import { stripeMode } from "@/lib/billing/stripe";
import type { Db } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";
import { AdjustCreditsForm } from "./adjust-credits";

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const num = (n: number) => n.toLocaleString("en-US");
const when = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);

const panel = "border-line bg-panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-5";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-line bg-panel flex flex-col gap-1 rounded-[var(--radius-control)] border p-4">
      <dt className="text-faint text-xs">{label}</dt>
      <dd className="text-fg text-2xl font-black tabular-nums">{value}</dd>
      {note ? <dd className="text-muted text-xs">{note}</dd> : null}
    </div>
  );
}

export async function Dashboard({ db, viewer }: { db: Db; viewer: Viewer }) {
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const [overview, models, webhook, today] = await Promise.all([
    getOverview(db, viewer, now),
    getModelCosts(db, viewer, monthStart),
    getWebhookStatus(db),
    usageToday(db, now),
  ]);
  const costMonth = models.reduce((s, m) => s + m.providerUsd, 0);
  const creditsMonth = models.reduce((s, m) => s + m.creditsCharged, 0);
  const spentToday = today.reduce((s, u) => s + u.costUsd, 0);
  const billing = stripeMode();
  const paying = PLAN_ORDER.reduce((s, id) => s + overview.plans[id], 0);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    now,
  );

  return (
    <div className="flex flex-col gap-10">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="People"
          value={num(overview.users.total)}
          note={`+${num(overview.users.newLast7Days)} in the last 7 days`}
        />
        <Stat
          label="Published templates"
          value={num(overview.templates.published)}
          note={`${num(overview.templates.remixes)} remixes · ${num(overview.templates.pendingReview)} waiting for review`}
        />
        <Stat
          label="Paying plans"
          value={num(paying)}
          note={PLAN_ORDER.map((id) => `${PLANS[id].name} ${overview.plans[id]}`).join(" · ")}
        />
        <Stat
          label={billing === "test" ? "Monthly revenue (test mode)" : "Monthly revenue"}
          value={usd(overview.mrrUsd, 0)}
          note="Live plans at list price"
        />
      </dl>

      <section aria-labelledby="cost-heading" className={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cost-heading" className="text-xl font-bold">
            AI cost in {monthName}
          </h2>
          <p className="text-muted text-sm">
            Today {usd(spentToday)} of {usd(AI_LIMITS.dailyBudgetUsd)} daily budget · AI access:{" "}
            {aiAccessMode() === "admins" ? "admins only" : "everyone signed in"} · providers on:{" "}
            {[...configuredProviders()].join(", ") || "none"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Provider cost (est.)" value={usd(costMonth)} />
          <Stat
            label="Credits charged"
            value={num(creditsMonth)}
            note={`Worth ${usd(creditsMonth * CREDIT_VALUE_USD)}`}
          />
          <Stat
            label="Subscriptions vs AI cost"
            value={costMonth > 0 ? `${(overview.mrrUsd / costMonth).toFixed(1)}×` : "–"}
            note="Monthly revenue ÷ provider cost"
          />
        </dl>
        {models.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-faint text-left">
                <tr>
                  <th className="py-1.5 font-normal">Model</th>
                  <th className="py-1.5 text-right font-normal">Requests</th>
                  <th className="py-1.5 text-right font-normal">Errors</th>
                  <th className="py-1.5 text-right font-normal">Tokens in / out</th>
                  <th className="py-1.5 text-right font-normal">Cost</th>
                  <th className="py-1.5 text-right font-normal">Credits</th>
                  <th className="py-1.5 text-right font-normal">Free · admin</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.modelId} className="border-line border-t">
                    <td className="py-2">{getModel(m.modelId)?.label ?? m.modelId}</td>
                    <td className="py-2 text-right tabular-nums">{num(m.requests)}</td>
                    <td
                      className={cn(
                        "py-2 text-right tabular-nums",
                        m.errors > 0 && m.errors / m.requests > 0.2 && "text-danger",
                      )}
                    >
                      {num(m.errors)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {num(m.inputTokens)} / {num(m.outputTokens)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{usd(m.providerUsd, 4)}</td>
                    <td className="py-2 text-right tabular-nums">{num(m.creditsCharged)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {num(m.freeRequests)} · {num(m.adminRequests)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-faint text-sm">No AI requests this month yet.</p>
        )}
        <p className="text-faint text-xs">
          Costs are estimated from token counts and the prices in config/models.ts. Free prompts and
          admin requests cost us money but charge no credits.
        </p>
      </section>

      <section aria-labelledby="payments-heading" className={panel}>
        <h2 id="payments-heading" className="text-xl font-bold">
          Payments and credits
        </h2>
        <ul className="text-muted flex flex-col gap-1.5 text-sm">
          <li>
            Stripe:{" "}
            <span className="text-fg">
              {billing === "off"
                ? "not set up"
                : billing === "live-blocked"
                  ? "live key refused (set STRIPE_ALLOW_LIVE=true to allow)"
                  : `${billing} mode`}
            </span>
          </li>
          <li>
            Last webhook from Stripe:{" "}
            {webhook.lastAt ? (
              <span className="text-fg">
                {when(webhook.lastAt)} ({webhook.lastType}) · {num(webhook.total)} received
              </span>
            ) : (
              <span className={billing === "off" ? "text-fg" : "text-danger"}>
                never
                {billing === "off"
                  ? ""
                  : ". Stripe hasn't reached /api/stripe/webhook yet, so renewals won't add credits. Check the endpoint's URL, events and signing secret in Stripe → Developers → Webhooks."}
              </span>
            )}
          </li>
        </ul>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Add or remove credits</h3>
          <AdjustCreditsForm />
          <p className="text-faint text-xs">
            Find someone on the{" "}
            <Link href="/admin/users" className="hover:text-fg underline">
              users page
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
