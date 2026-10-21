import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProjectGrid } from "@/components/gallery/project-card";
import { buttonClasses } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { listSavedProjects } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

export default function CollectionsPage() {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <h1 className="type-wide text-4xl font-black">Saved</h1>
      <Suspense
        fallback={<div className="bg-panel h-64 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <Saved />
      </Suspense>
    </section>
  );
}

async function Saved() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/collections");
  const cards = isDbConfigured() ? await listSavedProjects(getDb(), viewer.userId) : [];
  if (cards.length === 0) {
    return (
      <div className="border-line-strong flex min-h-56 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed p-8 text-center">
        <p className="text-fg font-semibold">Nothing saved yet</p>
        <p className="text-muted max-w-[44ch] text-sm">
          Save templates you want to remix later. They&apos;ll collect here.
        </p>
        <Link href="/explore" className={buttonClasses("secondary", "sm", "mt-1")}>
          Explore templates
        </Link>
      </div>
    );
  }
  return <ProjectGrid cards={cards} />;
}
