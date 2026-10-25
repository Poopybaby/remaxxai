import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LICENSES } from "@/config/licenses";
import { canOpenInEditor } from "@/lib/auth/permissions";
import { getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { getAncestorLicenses, getCreditChain } from "@/lib/licensing/chain";
import {
  allowedRemixLicenses,
  defaultRemixLicense,
  remixLicenseNote,
} from "@/lib/licensing/compat";
import { getProjectBySlug } from "@/lib/projects/queries";
import { REMIX_RIGHTS_STATEMENT } from "@/lib/projects/publish";
import { PublishForm } from "./publish-form";

export const metadata: Metadata = { title: "Publish your remix", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function PublishPage({ params }: PageProps<"/edit/[id]/publish">) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="type-wide text-4xl font-black">Publish your remix</h1>
        <p className="text-muted max-w-[60ch]">
          It goes into the gallery as your own template, with credit to everyone it&apos;s built on.
          Others can then remix it too.
        </p>
      </div>
      <Suspense
        fallback={<div className="bg-panel h-[36rem] rounded-[var(--radius-card)]" aria-hidden />}
      >
        <PublishLoader params={params} />
      </Suspense>
    </section>
  );
}

async function PublishLoader({ params }: Pick<PageProps<"/edit/[id]/publish">, "params">) {
  const { id } = await params;
  if (!UUID.test(id) || !isDbConfigured()) notFound();
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect(`/login?next=/edit/${id}/publish`);
  if (ctx.status === "needs_onboarding") redirect(`/onboarding?next=/edit/${id}/publish`);

  const db = getDb();
  const [row] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, id));
  const project = row ? await getProjectBySlug(db, row.slug) : null;
  if (!project) notFound();
  const viewer = { userId: ctx.userId, role: ctx.profile.role };
  if (!canOpenInEditor(viewer, { ownerId: project.owner.id, status: project.status })) {
    redirect(`/p/${project.slug}`);
  }

  const [chain, ancestorLicenses] = await Promise.all([
    getCreditChain(db, id),
    getAncestorLicenses(db, id),
  ]);
  const allowed = allowedRemixLicenses(ancestorLicenses);
  const licenses = allowed.map((lid) => ({
    id: lid,
    shortName: LICENSES[lid].shortName,
    summary: LICENSES[lid].summary,
  }));

  return (
    <PublishForm
      projectId={project.id}
      initial={{
        title: project.title,
        description: project.description,
        category: project.category,
        toolUsed: project.toolUsed,
        styles: project.tags.filter((t) => t.kind === "style").map((t) => t.slug),
        tags: project.tags.filter((t) => t.kind === "topic").map((t) => t.slug),
        licenseId: allowed.includes(project.license.id)
          ? project.license.id
          : defaultRemixLicense(ancestorLicenses),
        coverUrl: project.coverUrl,
      }}
      licenses={licenses}
      licenseNote={chain.length ? remixLicenseNote(ancestorLicenses) : null}
      chain={chain.map((c) => ({
        title: c.title,
        slug: c.slug,
        ownerHandle: c.ownerHandle,
        license: LICENSES[c.licenseId].shortName,
        available: c.available,
      }))}
      rightsStatement={REMIX_RIGHTS_STATEMENT}
    />
  );
}
