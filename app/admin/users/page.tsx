import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PLANS } from "@/config/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { listUsers } from "@/lib/admin/dashboard";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Admin · Users", robots: { index: false } };

const PAGE_SIZE = 50;
const day = (d: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-wide text-4xl font-black">Users</h1>
        <AdminNav current="users" />
      </div>
      <Suspense
        fallback={<div className="bg-panel h-64 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <Users searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Users({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  const viewer = await getViewer();
  if (!canAccessAdmin(viewer) || !isDbConfigured()) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const { rows, hasMore } = await listUsers(getDb(), viewer, {
    query: q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const link = (p: number) =>
    `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <form role="search" className="flex gap-2" action="/admin/users">
        <label htmlFor="user-q" className="sr-only">
          Search by handle or name
        </label>
        <Input id="user-q" name="q" defaultValue={q} placeholder="Search by handle or name" />
        <Button type="submit" variant="secondary" className="h-10 shrink-0">
          Search
        </Button>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-faint text-left">
              <tr>
                <th className="py-1.5 font-normal">Person</th>
                <th className="py-1.5 font-normal">Joined</th>
                <th className="py-1.5 font-normal">Plan</th>
                <th className="py-1.5 text-right font-normal">Credits</th>
                <th className="py-1.5 text-right font-normal">Free prompts</th>
                <th className="py-1.5 text-right font-normal">Templates</th>
                <th className="py-1.5 text-right font-normal">AI (30 days)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-line border-t">
                  <td className="py-2 pr-3">
                    <Link href={`/u/${u.handle}`} className="text-fg font-semibold hover:underline">
                      {u.displayName}
                    </Link>
                    <span className="text-faint"> @{u.handle}</span>
                    {u.role === "admin" ? (
                      <span className="bg-cyan/15 text-cyan ml-2 rounded-full px-2 py-0.5 text-xs font-semibold">
                        admin
                      </span>
                    ) : null}
                  </td>
                  <td className="text-muted py-2 pr-3 whitespace-nowrap">{day(u.createdAt)}</td>
                  <td className="py-2 pr-3">
                    {u.plan ? (
                      <span className="text-fg">{PLANS[u.plan].name}</span>
                    ) : (
                      <span className="text-faint">Free</span>
                    )}
                    {u.subscriptionStatus && u.subscriptionStatus !== "active" ? (
                      <span className="text-muted">
                        {" "}
                        ({u.subscriptionStatus.replace("_", " ")})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {u.balance.toLocaleString("en-US")}
                  </td>
                  <td className="py-2 text-right tabular-nums">{u.trialPrompts}</td>
                  <td className="py-2 text-right tabular-nums">{u.templates}</td>
                  <td className="py-2 text-right tabular-nums">{u.aiRequests30d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-faint text-sm">{q ? `No one matches "${q}".` : "No one yet."}</p>
      )}

      {page > 1 || hasMore ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={link(page - 1)} className="text-muted hover:text-fg">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-faint">Page {page}</span>
          {hasMore ? (
            <Link href={link(page + 1)} className="text-muted hover:text-fg">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
      <p className="text-faint text-xs">
        To add or remove credits for someone, use the form on the{" "}
        <Link href="/admin" className="hover:text-fg underline">
          overview
        </Link>
        .
      </p>
    </div>
  );
}
