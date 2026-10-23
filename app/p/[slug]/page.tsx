import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LicenseBadge } from "@/components/gallery/license-badge";
import { ProjectGrid } from "@/components/gallery/project-card";
import {
  FollowButton,
  LikeSaveButtons,
  VisibilityToggle,
} from "@/components/project/project-actions";
import { PreviewPanel } from "@/components/project/preview-panel";
import { ReportButton } from "@/components/project/report-dialog";
import { Avatar } from "@/components/ui/avatar";
import { LICENSES } from "@/config/licenses";
import { siteConfig } from "@/config/site";
import { CATEGORIES, labelFor, STYLES, TOOLS } from "@/config/taxonomy";
import { canViewProject } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import type { ProjectStatus } from "@/lib/db/schema";
import { getCreditChain, type Credit } from "@/lib/licensing/chain";
import {
  getFollowCounts,
  getProjectBySlug,
  getViewerProjectState,
  listVersionFiles,
} from "@/lib/projects/queries";
import { getStyleDescription, similarProjects } from "@/lib/search/query";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isDbConfigured()) return { title: "Project" };
  const p = await getProjectBySlug(getDb(), slug);
  if (!p || p.status !== "published") return { title: "Project", robots: { index: false } };
  return {
    title: `${p.title} by @${p.owner.handle}`,
    description:
      p.description ||
      `A ${labelFor(CATEGORIES, p.category).toLowerCase()} you can remix on REMAXX.`,
    openGraph: { title: p.title, images: p.coverUrl ? [{ url: p.coverUrl }] : undefined },
  };
}

export default function ProjectPage({ params }: PageProps<"/p/[slug]">) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

const STATUS_NOTE: Partial<Record<ProjectStatus, string>> = {
  pending_review: "Only you can see this. It's held for a quick review before it goes public.",
  unpublished: "Hidden. Only you can see this project.",
  removed: "This project was removed by an admin and isn't visible to anyone else.",
  hidden_pending_review: "Hidden while an admin reviews it.",
  draft: "Draft. Only you can see this.",
};

async function ProjectContent({ params }: Pick<PageProps<"/p/[slug]">, "params">) {
  const { slug } = await params;
  if (!isDbConfigured()) notFound();
  const db = getDb();
  const [project, viewer] = await Promise.all([getProjectBySlug(db, slug), getViewer()]);
  if (!project || !canViewProject(viewer, { ownerId: project.owner.id, status: project.status }))
    notFound();

  const versionId = project.currentVersionId;
  const [files, credits, followCounts, viewerState, lookAndFeel] = await Promise.all([
    versionId ? listVersionFiles(db, versionId) : Promise.resolve([]),
    getCreditChain(db, project.id),
    getFollowCounts(db, project.owner.id),
    viewer
      ? getViewerProjectState(db, viewer.userId, project.id, project.owner.id)
      : Promise.resolve(null),
    getStyleDescription(db, project.id),
  ]);

  const isOwner = viewer?.userId === project.owner.id;
  const published = project.status === "published";
  const previewUrl = versionId
    ? `${siteConfig.previewOrigin}/v/${versionId}/${project.entryPath}`
    : "";
  const license = LICENSES[project.license.id];
  const styles = project.tags.filter((t) => t.kind === "style");
  const topics = project.tags.filter((t) => t.kind === "topic");

  return (
    <article className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
      {!published ? (
        <div
          role="status"
          className="border-line-strong bg-panel flex flex-col gap-3 rounded-[var(--radius-control)] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-fg text-sm">
            {project.statusReason ?? STATUS_NOTE[project.status] ?? "Not public."}
          </p>
          {isOwner && project.status === "unpublished" ? (
            <VisibilityToggle projectId={project.id} published={false} />
          ) : null}
        </div>
      ) : null}

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          {credits.length ? <CreditLine credit={credits[0]!} /> : null}
          <h1 className="type-wide text-3xl leading-tight font-black text-balance sm:text-4xl lg:text-5xl">
            {project.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/u/${project.owner.handle}`}
              className="flex items-center gap-2.5 hover:underline"
            >
              <Avatar
                name={project.owner.displayName}
                handle={project.owner.handle}
                src={project.owner.avatarUrl}
                size={32}
              />
              <span className="font-semibold">{project.owner.displayName}</span>
              <span className="text-faint">@{project.owner.handle}</span>
            </Link>
            {!isOwner ? (
              <FollowButton
                userId={project.owner.id}
                following={viewerState?.following ?? false}
                followers={followCounts.followers}
                signedIn={Boolean(viewer)}
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {published ? (
            <LikeSaveButtons
              projectId={project.id}
              signedIn={Boolean(viewer)}
              liked={viewerState?.liked ?? false}
              saved={viewerState?.saved ?? false}
              likeCount={project.likeCount}
              saveCount={project.saveCount}
            />
          ) : null}
          <span
            className="bg-magenta/40 text-ink inline-flex h-11 cursor-not-allowed items-center rounded-[var(--radius-control)] px-5 text-[15px] font-semibold"
            title="The remix editor is coming in the next update"
            aria-disabled
          >
            Remix (soon)
          </span>
        </div>
      </header>

      {versionId ? (
        <PreviewPanel
          projectId={project.id}
          versionId={versionId}
          previewUrl={previewUrl}
          title={project.title}
          files={files}
          canPreview={published}
        />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          {project.description ? (
            <p className="text-fg max-w-[68ch] text-lg leading-relaxed whitespace-pre-line">
              {project.description}
            </p>
          ) : null}
          {lookAndFeel ? (
            <section aria-labelledby="look-heading" className="flex max-w-[68ch] flex-col gap-1.5">
              <h2 id="look-heading" className="text-faint text-sm font-semibold">
                Look and feel
              </h2>
              <p className="text-muted leading-relaxed">{lookAndFeel}</p>
            </section>
          ) : null}
          {credits.length ? <CreditChain credits={credits} /> : null}
        </div>

        <aside className="flex flex-col gap-5 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
            <dt className="text-faint">Category</dt>
            <dd>
              <Link href={`/explore?category=${project.category}`} className="hover:underline">
                {labelFor(CATEGORIES, project.category)}
              </Link>
            </dd>
            <dt className="text-faint">Made with</dt>
            <dd>
              <Link href={`/explore?tool=${project.toolUsed}`} className="hover:underline">
                {labelFor(TOOLS, project.toolUsed)}
              </Link>
            </dd>
            <dt className="text-faint">Remixes</dt>
            <dd>{project.remixCount}</dd>
            {project.publishedAt ? (
              <>
                <dt className="text-faint">Published</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                    project.publishedAt,
                  )}
                </dd>
              </>
            ) : null}
          </dl>

          {styles.length || topics.length ? (
            <div className="flex flex-wrap gap-1.5">
              {styles.map((t) => (
                <Link
                  key={t.slug}
                  href={`/explore?style=${t.slug}`}
                  className="border-line text-muted hover:border-line-strong hover:text-fg rounded-full border px-2.5 py-1"
                >
                  {labelFor(STYLES, t.slug)}
                </Link>
              ))}
              {topics.map((t) => (
                <Link
                  key={t.slug}
                  href={`/explore?q=${encodeURIComponent(t.slug)}`}
                  className="border-line text-muted hover:border-line-strong hover:text-fg rounded-full border px-2.5 py-1"
                >
                  #{t.slug}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="border-line flex flex-col gap-2 rounded-[var(--radius-control)] border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg font-semibold">License</span>
              <LicenseBadge id={project.license.id} />
            </div>
            <p className="text-muted">{license.summary}</p>
            <a
              href={project.license.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-fg w-fit underline underline-offset-4"
            >
              Read the {license.shortName} license
            </a>
          </div>

          <div className="flex items-center justify-between">
            {isOwner && published ? (
              <VisibilityToggle projectId={project.id} published />
            ) : (
              <span />
            )}
            {!isOwner ? <ReportButton projectId={project.id} signedIn={Boolean(viewer)} /> : null}
          </div>
        </aside>
      </div>

      {published ? (
        <Suspense fallback={null}>
          <MoreLikeThis projectId={project.id} />
        </Suspense>
      ) : null}
    </article>
  );
}

async function MoreLikeThis({ projectId }: { projectId: string }) {
  const cards = await similarProjects(getDb(), projectId, 8);
  if (cards.length === 0) return null;
  return (
    <section
      aria-labelledby="similar-heading"
      className="border-line mt-6 flex flex-col gap-5 border-t pt-10"
    >
      <h2 id="similar-heading" className="type-wide text-2xl font-black">
        More like this
      </h2>
      <ProjectGrid cards={cards} />
    </section>
  );
}

function CreditLine({ credit }: { credit: Credit }) {
  return (
    <p className="text-muted text-sm">
      Remixed from{" "}
      {credit.available ? (
        <Link href={`/p/${credit.slug}`} className="text-cyan font-semibold hover:underline">
          {credit.title}
        </Link>
      ) : (
        <span className="text-fg font-semibold">{credit.title}</span>
      )}{" "}
      by{" "}
      <Link href={`/u/${credit.ownerHandle}`} className="hover:underline">
        @{credit.ownerHandle}
      </Link>
      {credit.removed ? <span className="text-faint"> (original removed)</span> : null}
    </p>
  );
}

function CreditChain({ credits }: { credits: Credit[] }) {
  return (
    <section aria-labelledby="credits-heading" className="flex flex-col gap-3">
      <h2 id="credits-heading" className="text-fg font-bold">
        Built on
      </h2>
      <ol className="flex flex-col gap-2">
        {credits.map((c) => (
          <li key={c.position} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {c.available ? (
              <Link href={`/p/${c.slug}`} className="text-fg font-semibold hover:underline">
                {c.title}
              </Link>
            ) : (
              <span className="text-muted font-semibold">{c.title}</span>
            )}
            <span className="text-muted">by @{c.ownerHandle}</span>
            <LicenseBadge id={c.licenseId} />
            {c.removed ? <span className="text-faint">original removed</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProjectSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      aria-busy
    >
      <div className="bg-panel h-12 w-2/3 rounded" />
      <div className="bg-panel h-8 w-56 rounded" />
      <div className="bg-panel h-[70svh] min-h-[420px] rounded-[var(--radius-card)]" />
    </div>
  );
}
