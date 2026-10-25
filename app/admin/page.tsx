import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  approveProjectAction,
  dismissReportAction,
  refreshSearchIndexAction,
  removeProjectAction,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { isOpenAiConfigured } from "@/lib/ai/openai";
import { listOpenReports, listProjectsAwaitingReview } from "@/lib/moderation/actions";
import { indexStatus } from "@/lib/search/indexer";
import { usageToday } from "@/lib/ai/pipeline";
import { AI_LIMITS } from "@/config/limits";
import { CREDIT_VALUE_USD } from "@/config/plans";
import { spendSince } from "@/lib/billing/credits";
import { stripeMode } from "@/lib/billing/stripe";
import { AdjustCreditsForm } from "./adjust-credits";
import { aiAccessMode, configuredProviders } from "@/lib/ai/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const REASON_LABEL: Record<string, string> = {
  copyright: "Copyright",
  leaked_code: "Leaked code",
  malware: "Malware",
  phishing: "Phishing",
  sexual: "Sexual content",
  hate: "Hate",
  harassment: "Harassment",
  spam: "Spam",
  other: "Other",
};

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);

export default function AdminPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
      <h1 className="type-wide text-4xl font-black">Admin</h1>
      <Suspense
        fallback={<div className="bg-panel h-64 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <Queues />
      </Suspense>
    </section>
  );
}

async function Queues() {
  const viewer = await getViewer();
  if (!canAccessAdmin(viewer) || !isDbConfigured()) notFound();
  const db = getDb();
  const [reports, review, index] = await Promise.all([
    listOpenReports(db, viewer),
    listProjectsAwaitingReview(db, viewer),
    indexStatus(db),
  ]);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [usage, month] = await Promise.all([usageToday(db), spendSince(db, monthStart)]);
  const billing = stripeMode();
  const spent = usage.reduce((sum, u) => sum + u.costUsd, 0);
  const aiOn = isOpenAiConfigured();

  return (
    <div className="flex flex-col gap-12">
      <section
        aria-labelledby="ai-heading"
        className="border-line bg-panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ai-heading" className="text-xl font-bold">
            AI usage today
          </h2>
          <p className="text-muted text-sm">
            ${spent.toFixed(2)} of ${AI_LIMITS.dailyBudgetUsd} daily budget · access:{" "}
            {aiAccessMode() === "admins" ? "admins only" : "everyone signed in"} · providers set up:{" "}
            {[...configuredProviders()].join(", ") || "none"}
          </p>
        </div>
        {usage.length ? (
          <table className="text-sm">
            <thead className="text-faint text-left">
              <tr>
                <th className="py-1 font-normal">Model</th>
                <th className="py-1 text-right font-normal">Requests</th>
                <th className="py-1 text-right font-normal">Errors</th>
                <th className="py-1 text-right font-normal">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.modelId ?? "none"} className="border-line border-t">
                  <td className="py-1.5">{u.modelId ?? "unknown"}</td>
                  <td className="py-1.5 text-right">{u.requests}</td>
                  <td className="py-1.5 text-right">{u.errors}</td>
                  <td className="py-1.5 text-right">${u.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-faint text-sm">No AI requests yet today.</p>
        )}
      </section>
      <section
        aria-labelledby="credits-heading"
        className="border-line bg-panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="credits-heading" className="text-xl font-bold">
            Credits
          </h2>
          <p className="text-muted text-sm">
            Stripe:{" "}
            {billing === "off"
              ? "not set up"
              : billing === "live-blocked"
                ? "live key refused (set STRIPE_ALLOW_LIVE=true to allow)"
                : `${billing} mode`}
          </p>
        </div>
        <p className="text-muted text-sm">
          This month: {month.credits.toLocaleString("en-US")} credits charged (about $
          {(month.credits * CREDIT_VALUE_USD).toFixed(2)}) against ${month.providerUsd.toFixed(2)}{" "}
          estimated provider cost
          {month.providerUsd > 0
            ? ` (${((month.credits * CREDIT_VALUE_USD) / month.providerUsd).toFixed(1)}× markup; free prompts and admin use count as cost with no charge)`
            : ""}
          .
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Add or remove credits</h3>
          <AdjustCreditsForm />
        </div>
      </section>
      <section
        aria-labelledby="search-heading"
        className="border-line bg-panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <h2 id="search-heading" className="text-xl font-bold">
            Vibe search index
          </h2>
          <p className="text-muted text-sm">
            {index.indexed} of {index.published} published templates indexed, {index.embedded} with
            vibe embeddings.
            {aiOn
              ? " New uploads are indexed automatically."
              : " Add OPENAI_API_KEY to turn on vibe matching; search uses words only until then."}
          </p>
        </div>
        <form action={refreshSearchIndexAction}>
          <Button type="submit" variant="secondary" size="sm">
            Index missing now
          </Button>
        </form>
      </section>
      <section aria-labelledby="reports-heading" className="flex flex-col gap-4">
        <h2 id="reports-heading" className="text-xl font-bold">
          Open reports <span className="text-muted">({reports.length})</span>
        </h2>
        {reports.length === 0 ? <p className="text-muted">No open reports.</p> : null}
        {reports.map((r) => (
          <article
            key={r.id}
            className="border-line bg-panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {r.isDmca ? (
                <span className="bg-danger/20 text-danger rounded px-2 py-0.5 font-semibold">
                  DMCA notice
                </span>
              ) : null}
              <span className="bg-panel-raised rounded px-2 py-0.5 font-semibold">
                {REASON_LABEL[r.reason] ?? r.reason}
              </span>
              <span className="text-faint">{fmt(r.createdAt)}</span>
              <span className="text-faint">
                {r.reporterHandle
                  ? `by @${r.reporterHandle}`
                  : r.contactEmail
                    ? `from ${r.contactName ?? ""} <${r.contactEmail}>`
                    : "anonymous"}
              </span>
            </div>
            {r.project ? (
              <p>
                <Link
                  href={`/p/${r.project.slug}`}
                  className="font-semibold underline underline-offset-4"
                >
                  {r.project.title}
                </Link>{" "}
                <span className="text-faint text-sm">({r.project.status})</span>
              </p>
            ) : null}
            {r.details ? (
              <p className="text-muted text-sm whitespace-pre-line">{r.details}</p>
            ) : null}
            <div className="border-line flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
              {r.project && r.project.status !== "removed" ? (
                <form action={removeProjectAction} className="flex flex-1 flex-col gap-2">
                  <input type="hidden" name="projectId" value={r.project.id} />
                  <input type="hidden" name="reportId" value={r.id} />
                  <input
                    name="note"
                    placeholder="Note for the owner (optional)"
                    className="border-line bg-ink-deep h-9 rounded-lg border px-3 text-sm"
                  />
                  <label className="text-muted flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="copyright"
                      defaultChecked={r.reason === "copyright"}
                      className="accent-magenta"
                    />
                    Copyright removal (also hides remixes for review)
                  </label>
                  <Button type="submit" size="sm" className="bg-danger hover:bg-danger/80 w-fit">
                    Remove project
                  </Button>
                </form>
              ) : null}
              <form action={dismissReportAction}>
                <input type="hidden" name="reportId" value={r.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Dismiss report
                </Button>
              </form>
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="review-heading" className="flex flex-col gap-4">
        <h2 id="review-heading" className="text-xl font-bold">
          Waiting for review <span className="text-muted">({review.length})</span>
        </h2>
        {review.length === 0 ? <p className="text-muted">Nothing waiting.</p> : null}
        {review.map((p) => (
          <article
            key={p.id}
            className="border-line bg-panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
          >
            <p>
              <Link href={`/p/${p.slug}`} className="font-semibold underline underline-offset-4">
                {p.title}
              </Link>{" "}
              <span className="text-faint text-sm">
                by @{p.ownerHandle}, {fmt(p.createdAt)},{" "}
                {p.status === "hidden_pending_review"
                  ? "hidden after an upstream takedown"
                  : "held at upload"}
              </span>
            </p>
            {p.findings.length ? (
              <ul className="text-muted list-disc pl-5 text-sm">
                {p.findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : p.statusReason ? (
              <p className="text-muted text-sm">{p.statusReason}</p>
            ) : null}
            <div className="border-line flex flex-wrap gap-2 border-t pt-3">
              <form action={approveProjectAction}>
                <input type="hidden" name="projectId" value={p.id} />
                <Button type="submit" size="sm">
                  Approve and publish
                </Button>
              </form>
              <form action={removeProjectAction}>
                <input type="hidden" name="projectId" value={p.id} />
                <input type="hidden" name="note" value="Didn't pass review." />
                <Button type="submit" variant="secondary" size="sm">
                  Remove
                </Button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
