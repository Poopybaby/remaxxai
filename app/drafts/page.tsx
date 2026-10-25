import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DeleteDraftButton } from "@/components/project/delete-draft-button";
import { buttonClasses } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { listDrafts } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Drafts", robots: { index: false } };

export default function DraftsPage() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="type-wide text-4xl font-black">Drafts</h1>
        <p className="text-muted">
          Projects you&apos;re creating or remixing. Only you can see them.
        </p>
      </div>
      <Suspense
        fallback={<div className="bg-panel h-64 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <Drafts />
      </Suspense>
    </section>
  );
}

const ago = (d: Date) => {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);
};

async function Drafts() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/drafts");
  const drafts = isDbConfigured() ? await listDrafts(getDb(), viewer.userId) : [];
  if (drafts.length === 0) {
    return (
      <div className="border-line-strong flex min-h-56 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed p-8 text-center">
        <p className="text-fg font-semibold">No drafts yet</p>
        <p className="text-muted max-w-[44ch] text-sm">
          Start something new, or find a template you like and hit Remix.
        </p>
        <div className="mt-1 flex gap-2">
          <Link href="/create" className={buttonClasses("primary", "sm")}>
            Create
          </Link>
          <Link href="/explore" className={buttonClasses("secondary", "sm")}>
            Explore templates
          </Link>
        </div>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {drafts.map((d) => (
        <li key={d.id} className="flex flex-col gap-3">
          <Link
            href={`/edit/${d.id}`}
            className="border-line bg-panel hover:border-line-strong relative block aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] border"
          >
            {d.coverUrl ? (
              <Image
                src={d.coverUrl}
                alt=""
                fill
                sizes="(min-width: 1280px) 320px, (min-width: 640px) 50vw, 100vw"
                className="object-cover object-top opacity-80"
              />
            ) : null}
            <span className="bg-ink/90 text-fg absolute top-2.5 left-2.5 rounded-md px-2 py-1 text-xs font-semibold">
              Draft
            </span>
          </Link>
          <div className="flex flex-col gap-1 px-0.5">
            <h2 className="line-clamp-1 font-bold">
              <Link href={`/edit/${d.id}`} className="hover:underline">
                {d.title}
              </Link>
            </h2>
            <p className="text-faint text-sm">
              {d.parentTitle ? `Remix of ${d.parentTitle} · ` : ""}edited {ago(d.updatedAt)}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <Link href={`/edit/${d.id}`} className={buttonClasses("secondary", "sm")}>
                Open editor
              </Link>
              <DeleteDraftButton projectId={d.id} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
