/**
 * Vibe search and "More like this" against Postgres. Gathers candidates two ways (embedding
 * similarity and full-text words), then lets rank.ts decide the order and the reasons.
 * The query embedding is passed in, so the caller owns rate limits, timeouts and caching.
 */
import { and, asc, cosineDistance, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { isStyleId } from "@/config/taxonomy";
import { projectSearch, projects, projectTags, tags } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import {
  filterConditions,
  getCardsByIds,
  type ExploreFilters,
  type ProjectCard,
} from "@/lib/projects/queries";
import { rankCandidates, rankSimilar, type MatchReason, type SimilarCandidate } from "./rank";
import { parseQuery, projectTerms } from "./text";

export type SearchCard = ProjectCard & { reasons: MatchReason[] };
export type SearchResult = { cards: SearchCard[]; mode: "vibe" | "keyword" };

const VECTOR_CANDIDATES = 80;
const KEYWORD_CANDIDATES = 200;

/** "dark | glassy | fintech:*" — any word may match; long words also match as prefixes. */
export function toTsQuery(terms: string[]): string | null {
  const safe = terms.map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length >= 2);
  if (safe.length === 0) return null;
  return safe.map((t) => (t.length >= 4 ? `${t}:*` : t)).join(" | ");
}

export async function vibeSearch(
  db: Db,
  input: { q: string; filters: ExploreFilters; queryVector: number[] | null; limit?: number },
): Promise<SearchResult> {
  const parsed = parseQuery(input.q);
  const tsq = toTsQuery(parsed.terms);
  const where = filterConditions(input.filters);
  const mode = input.queryVector ? "vibe" : "keyword";
  if (!tsq && !input.queryVector) return { cards: [], mode };

  const ids = new Set<string>();
  if (tsq) {
    const rows = await db
      .select({ id: projects.id })
      .from(projectSearch)
      .innerJoin(projects, eq(projects.id, projectSearch.projectId))
      .where(and(...where, sql`${projectSearch.searchTsv} @@ to_tsquery('english', ${tsq})`))
      .limit(KEYWORD_CANDIDATES);
    for (const r of rows) ids.add(r.id);
  }
  if (input.queryVector) {
    const rows = await db
      .select({ id: projects.id })
      .from(projectSearch)
      .innerJoin(projects, eq(projects.id, projectSearch.projectId))
      .where(and(...where, isNotNull(projectSearch.embedding)))
      .orderBy(cosineDistance(projectSearch.embedding, input.queryVector))
      .limit(VECTOR_CANDIDATES);
    for (const r of rows) ids.add(r.id);
  }
  if (ids.size === 0) return { cards: [], mode };

  const details = await loadDetails(db, [...ids], input.queryVector);
  const ranked = rankCandidates(
    parsed,
    details.map((d) => ({
      id: d.id,
      terms: projectTerms(d),
      similarity: d.similarity,
      likeCount: d.likeCount,
      remixCount: d.remixCount,
      publishedAt: d.publishedAt,
    })),
    input.limit ?? 48,
  );
  const cards = await getCardsByIds(
    db,
    ranked.map((r) => r.id),
  );
  const reasons = new Map(ranked.map((r) => [r.id, r.reasons]));
  return { cards: cards.map((c) => ({ ...c, reasons: reasons.get(c.id) ?? [] })), mode };
}

/** Published projects most like `projectId`, with reasons. Works with or without embeddings. */
export async function similarProjects(db: Db, projectId: string, limit = 8): Promise<SearchCard[]> {
  const [source] = await db
    .select({ embedding: projectSearch.embedding, category: projects.category })
    .from(projects)
    .leftJoin(projectSearch, eq(projectSearch.projectId, projects.id))
    .where(eq(projects.id, projectId));
  if (!source) return [];
  const sourceTags = await tagsFor(db, [projectId]);
  const own = splitTags(sourceTags.get(projectId) ?? []);

  const ids = new Set<string>();
  const base = [eq(projects.status, "published"), ne(projects.id, projectId)];
  if (source.embedding) {
    const rows = await db
      .select({ id: projects.id })
      .from(projectSearch)
      .innerJoin(projects, eq(projects.id, projectSearch.projectId))
      .where(and(...base, isNotNull(projectSearch.embedding)))
      .orderBy(cosineDistance(projectSearch.embedding, source.embedding))
      .limit(40);
    for (const r of rows) ids.add(r.id);
  }
  const slugs = [...own.styles, ...own.tags];
  if (slugs.length) {
    const rows = await db
      .selectDistinct({ id: projects.id })
      .from(projectTags)
      .innerJoin(tags, eq(tags.id, projectTags.tagId))
      .innerJoin(projects, eq(projects.id, projectTags.projectId))
      .where(and(...base, inArray(tags.slug, slugs)))
      .limit(60);
    for (const r of rows) ids.add(r.id);
  }
  if (ids.size === 0) return [];

  const details = await loadDetails(db, [...ids], source.embedding ?? null);
  const ranked = rankSimilar(
    { ...own, category: source.category },
    details.map((d): SimilarCandidate => ({
      id: d.id,
      terms: projectTerms(d),
      similarity: d.similarity,
      likeCount: d.likeCount,
      remixCount: d.remixCount,
      publishedAt: d.publishedAt,
      styles: d.styles,
      tags: d.tags,
      category: d.category,
    })),
    limit,
  );
  const cards = await getCardsByIds(
    db,
    ranked.map((r) => r.id),
  );
  const reasons = new Map(ranked.map((r) => [r.id, r.reasons]));
  return cards.map((c) => ({ ...c, reasons: reasons.get(c.id) ?? [] }));
}

type Detail = {
  id: string;
  title: string;
  description: string;
  category: string;
  toolUsed: string;
  styles: string[];
  tags: string[];
  styleDescription: string;
  likeCount: number;
  remixCount: number;
  publishedAt: number;
  similarity: number | null;
};

async function loadDetails(db: Db, ids: string[], vector: number[] | null): Promise<Detail[]> {
  const similarity: SQL<number | null> = vector
    ? sql<
        number | null
      >`case when ${projectSearch.embedding} is null then null else 1 - (${cosineDistance(projectSearch.embedding, vector)}) end`
    : sql<null>`null`;
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      category: projects.category,
      toolUsed: projects.toolUsed,
      likeCount: projects.likeCount,
      remixCount: projects.remixCount,
      publishedAt: projects.publishedAt,
      createdAt: projects.createdAt,
      styleDescription: projectSearch.styleDescription,
      similarity,
    })
    .from(projects)
    .leftJoin(projectSearch, eq(projectSearch.projectId, projects.id))
    .where(inArray(projects.id, ids));
  const tagMap = await tagsFor(db, ids);
  return rows.map((r) => {
    const split = splitTags(tagMap.get(r.id) ?? []);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      toolUsed: r.toolUsed,
      styles: split.styles,
      tags: split.tags,
      styleDescription: r.styleDescription ?? "",
      likeCount: r.likeCount,
      remixCount: r.remixCount,
      publishedAt: (r.publishedAt ?? r.createdAt).getTime(),
      similarity: r.similarity === null ? null : Number(r.similarity),
    };
  });
}

async function tagsFor(
  db: Db,
  ids: string[],
): Promise<Map<string, { slug: string; kind: string }[]>> {
  const rows = await db
    .select({ projectId: projectTags.projectId, slug: tags.slug, kind: tags.kind })
    .from(projectTags)
    .innerJoin(tags, eq(tags.id, projectTags.tagId))
    .where(inArray(projectTags.projectId, ids))
    .orderBy(asc(tags.slug));
  const map = new Map<string, { slug: string; kind: string }[]>();
  for (const r of rows) {
    const list = map.get(r.projectId) ?? [];
    list.push({ slug: r.slug, kind: r.kind });
    map.set(r.projectId, list);
  }
  return map;
}

function splitTags(list: { slug: string; kind: string }[]): { styles: string[]; tags: string[] } {
  const styles = list.filter((t) => t.kind === "style" || isStyleId(t.slug)).map((t) => t.slug);
  return { styles, tags: list.map((t) => t.slug).filter((s) => !styles.includes(s)) };
}

/** The plain-language look-and-feel description shown on a project page, if indexed. */
export async function getStyleDescription(db: Db, projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ text: projectSearch.styleDescription })
    .from(projectSearch)
    .where(eq(projectSearch.projectId, projectId));
  return row?.text || null;
}
