import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { ProjectGrid } from "@/components/gallery/project-card";
import { buttonClasses } from "@/components/ui/button";
import { isLicenseId } from "@/config/licenses";
import { isCategoryId, isStyleId, isToolId } from "@/config/taxonomy";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { RATE_LIMITS } from "@/config/limits";
import { listPublishedProjects, type ExploreFilters } from "@/lib/projects/queries";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { cachedQueryEmbedding, embedQuery, getEmbedder } from "@/lib/search/ai";
import { refreshSearchIndex } from "@/lib/search/background";
import { vibeSearch } from "@/lib/search/query";
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
  if (filters.q?.trim()) return <SearchResults filters={filters} />;

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
      {!active && page === 1 ? <VibeExamples /> : null}
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

const EXAMPLE_VIBES = [
  "dark glassy fintech dashboard",
  "playful pastel booking site",
  "neon retro arcade game",
  "calm editorial portfolio",
  "loud brutalist poster",
];

function VibeExamples() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-faint">Search by vibe, try:</span>
      {EXAMPLE_VIBES.map((v) => (
        <Link
          key={v}
          href={`/explore?q=${encodeURIComponent(v)}`}
          className="border-line text-muted hover:border-cyan/50 hover:text-fg rounded-full border px-3 py-1"
        >
          {v}
        </Link>
      ))}
    </div>
  );
}

/**
 * Embeds the query when vibe search is on (cached, rate limited, short timeout), then ranks.
 * Any trouble with the AI side quietly falls back to matching words.
 */
async function SearchResults({ filters }: { filters: ExploreFilters }) {
  const q = (filters.q ?? "").trim();
  const db = getDb();
  const embedder = getEmbedder();
  let queryVector: number[] | null = null;
  let notice: string | null = null;
  if (embedder) {
    queryVector = cachedQueryEmbedding(q) ?? null;
    if (!queryVector) {
      const ip = clientIp(await headers());
      const limit = await rateLimit("vibe-search", ip, RATE_LIMITS.vibeSearch);
      if (!limit.success) {
        notice = "You're searching fast, so these results match your words only for a minute.";
      } else {
        queryVector = await embedQuery(embedder, q).catch(() => null);
        if (!queryVector) notice = "Vibe matching is busy, so these results match your words only.";
      }
    }
  }
  const { cards, mode } = await vibeSearch(db, { q, filters, queryVector });
  // Pick up anything not yet indexed (new uploads, fresh seeds) after the page is sent.
  after(() => refreshSearchIndex());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted text-sm" role="status">
          {cards.length === 0
            ? "No matches"
            : `${cards.length} ${cards.length === 1 ? "match" : "matches"}`}{" "}
          for <span className="text-fg font-semibold">“{q}”</span>
          {mode === "vibe" ? ", ranked by vibe and words" : ", ranked by matching words"}
        </p>
        {notice ? <p className="text-faint text-sm">{notice}</p> : null}
      </div>
      {cards.length ? (
        <ProjectGrid cards={cards} />
      ) : (
        <Empty
          title="Nothing matches that vibe yet"
          body="Try fewer or broader words, like “dark dashboard” or “pastel landing page”."
          action={{ href: "/explore", label: "Clear search" }}
        />
      )}
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
