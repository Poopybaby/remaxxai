import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProjectGrid } from "@/components/gallery/project-card";
import { buttonClasses } from "@/components/ui/button";
import { isLicenseId } from "@/config/licenses";
import { isCategoryId, isStyleId, isToolId } from "@/config/taxonomy";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { listPublishedProjects, type ExploreFilters } from "@/lib/projects/queries";
import { ExploreControls } from "./explore-controls";

export const metadata: Metadata = {
  title: "Explore templates",
  description: "Browse AI-built sites, tools and UI kits you can remix.",
};

type Search = Record<string, string | string[] | undefined>;

function readFilters(sp: Search): ExploreFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const category = one("category");
  const tool = one("tool");
  const license = one("license");
  const style = one("style");
  const page = Number(one("page") ?? "1");
  return {
    q: one("q")?.slice(0, 100),
    category: category && isCategoryId(category) ? category : undefined,
    tool: tool && isToolId(tool) ? tool : undefined,
    license: license && isLicenseId(license) ? license : undefined,
    style: style && isStyleId(style) ? style : undefined,
    sort: one("sort") === "popular" ? "popular" : "new",
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <h1 className="type-wide text-4xl font-black sm:text-5xl">Explore</h1>
      <Suspense
        fallback={<div className="bg-panel/60 h-28 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <Controls searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<GridSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Controls({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const filters = readFilters(await searchParams);
  return <ExploreControls key={JSON.stringify(filters)} filters={filters} />;
}

async function Results({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const sp = await searchParams;
  const filters = readFilters(sp);
  if (!isDbConfigured()) {
    return (
      <Empty title="The gallery isn't connected yet" body="Add DATABASE_URL to load templates." />
    );
  }
  const { cards, hasMore } = await listPublishedProjects(getDb(), filters);
  const active = Boolean(
    filters.q || filters.category || filters.tool || filters.license || filters.style,
  );

  if (cards.length === 0) {
    return active ? (
      <Empty
        title="Nothing matches those filters"
        body="Try fewer filters or a different search."
        action={{ href: "/explore", label: "Clear filters" }}
      />
    ) : (
      <Empty
        title="No templates yet"
        body="Be the first to share one."
        action={{ href: "/upload", label: "Upload a template" }}
      />
    );
  }

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp))
      if (typeof v === "string" && k !== "page") params.set(k, v);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/explore?${qs}` : "/explore";
  };
  const page = filters.page ?? 1;

  return (
    <div className="flex flex-col gap-10">
      <ProjectGrid cards={cards} />
      {page > 1 || hasMore ? (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonClasses("secondary")}>
              Previous page
            </Link>
          ) : null}
          {hasMore ? (
            <Link href={pageHref(page + 1)} className={buttonClasses("secondary")}>
              Next page
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="border-line-strong flex min-h-64 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed p-8 text-center">
      <p className="text-fg font-semibold">{title}</p>
      <p className="text-muted max-w-[44ch] text-sm">{body}</p>
      {action ? (
        <Link href={action.href} className={buttonClasses("secondary", "sm", "mt-2")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="bg-panel aspect-[4/3] rounded-[var(--radius-card)]" />
          <div className="bg-panel h-4 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}
