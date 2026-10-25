import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LICENSES } from "@/config/licenses";
import { siteConfig } from "@/config/site";
import { getOrCreateSession, sessionHistory } from "@/lib/ai/pipeline";
import { aiAccessMode, modelOptions } from "@/lib/ai/server";
import { canOpenInEditor, canUseAi } from "@/lib/auth/permissions";
import { getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getCreditChain } from "@/lib/licensing/chain";
import { getProjectBySlug } from "@/lib/projects/queries";
import { listVersions, loadEditorFiles } from "@/lib/projects/versions";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Editor, type EditorData } from "./editor";

export const metadata: Metadata = { title: "Remix editor", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function EditPage({ params }: PageProps<"/edit/[id]">) {
  return (
    <Suspense fallback={<div className="bg-ink h-[calc(100dvh-4rem)]" aria-busy />}>
      <EditorLoader params={params} />
    </Suspense>
  );
}

async function EditorLoader({ params }: Pick<PageProps<"/edit/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id) || !isDbConfigured()) notFound();
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect(`/login?next=/edit/${id}`);
  if (ctx.status === "needs_onboarding") redirect(`/onboarding?next=/edit/${id}`);
  const viewer = { userId: ctx.userId, role: ctx.profile.role };

  const db = getDb();
  const [row] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, id));
  const project = row ? await getProjectBySlug(db, row.slug) : null;
  if (!project || !project.currentVersionId) notFound();
  if (!canOpenInEditor(viewer, { ownerId: project.owner.id, status: project.status })) {
    // Published or someone else's: show the project page instead.
    redirect(`/p/${project.slug}`);
  }

  const sessionId = await getOrCreateSession(db, viewer.userId, project.id);
  const [files, credits, history, versions] = await Promise.all([
    loadEditorFiles(db, project.currentVersionId),
    getCreditChain(db, project.id),
    sessionHistory(db, sessionId, 20),
    listVersions(db, viewer, project.id),
  ]);
  const aiAllowed = canUseAi(viewer, aiAccessMode());

  const data: EditorData = {
    project: {
      id: project.id,
      title: project.title,
      slug: project.slug,
      entryPath: project.entryPath,
      license: LICENSES[project.license.id].shortName,
    },
    credit: credits[0]
      ? { title: credits[0].title, slug: credits[0].slug, ownerHandle: credits[0].ownerHandle }
      : null,
    version: { id: project.currentVersionId, number: versions[0]?.number ?? 1 },
    files,
    history: history.map((h, i) => ({
      id: `h${i}`,
      role: h.role,
      text: h.content || (h.status === "error" ? "That request didn't work." : ""),
      status:
        h.status === "ok"
          ? "ok"
          : h.status === "pending"
            ? "error"
            : (h.status as "error" | "blocked"),
    })),
    models: modelOptions(),
    ai: aiAllowed
      ? { allowed: true }
      : {
          allowed: false,
          reason: "AI editing is in early access for now. You can still edit the code by hand.",
        },
    previewOrigin: new URL(siteConfig.previewOrigin).origin,
  };
  return <Editor data={data} />;
}
