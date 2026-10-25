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
import { AdminNav } from "./admin-nav";
import { Dashboard } from "./dashboard";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { isOpenAiConfigured } from "@/lib/ai/openai";
import { listOpenReports, listProjectsAwaitingReview } from "@/lib/moderation/actions";
import { indexStatus } from "@/lib/search/indexer";

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-wide text-4xl font-black">Admin</h1>
        <AdminNav current="overview" />
      </div>
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
  const aiOn = isOpenAiConfigured();

  return (
    <div className="flex flex-col gap-12">
      <Dashboard db={db} viewer={viewer} />
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
