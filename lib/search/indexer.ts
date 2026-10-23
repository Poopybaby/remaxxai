/**
 * Keeps project_search up to date: a style description per project (hand-written for starter
 * templates, AI-written for uploads, or built from code hints), the search text, and its
 * embedding. Only does work that's missing or out of date, so it's cheap to call often.
 * Takes its AI pieces as arguments, so tests run it with a fake embedder and no network.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { isStyleId } from "@/config/taxonomy";
import { blobs, projectFiles, projectSearch, projects, projectTags, tags } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { styleHints } from "./hints";
import { buildSearchText } from "./text";

export type Embedder = { model: string; embed(texts: string[]): Promise<number[][]> };

export type DescribeInput = { title: string; description: string; hints: string[]; code: string };
export type Describer = (input: DescribeInput) => Promise<string>;

export type IndexResult = { indexed: number; embedded: number; described: number; failed: number };

const TEXT_FILE = /\.(html?|css|m?js|svg|md|txt|json)$/i;
const MAX_CODE_BYTES = 60_000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** A one-paragraph description from code hints alone, used when there's no AI describer. */
export function describeFromHints(phrases: string[]): string {
  if (phrases.length === 0) return "";
  const text = phrases.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Strips anything that isn't plain prose from a model's description. */
export function cleanDescription(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

/**
 * Indexes published projects that are missing from the index, have a newer version than their
 * description, or lack an embedding. `projectIds` limits it to those projects.
 */
export async function indexProjects(
  db: Db,
  opts: {
    embedder: Embedder | null;
    describer: Describer | null;
    projectIds?: string[];
    limit?: number;
  },
): Promise<IndexResult> {
  const result: IndexResult = { indexed: 0, embedded: 0, described: 0, failed: 0 };
  const stale = or(
    isNull(projectSearch.projectId),
    sql`${projectSearch.versionId} is distinct from ${projects.currentVersionId}`,
    opts.embedder
      ? or(
          isNull(projectSearch.embedding),
          ne(projectSearch.embeddingModel, opts.embedder.model),
          sql`${projectSearch.embeddedTextHash} is distinct from encode(sha256(convert_to(${projectSearch.searchText}, 'UTF8')), 'hex')`,
        )
      : undefined,
  );
  const targets = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      category: projects.category,
      toolUsed: projects.toolUsed,
      versionId: projects.currentVersionId,
      rowVersionId: projectSearch.versionId,
      rowDescription: projectSearch.styleDescription,
      rowSource: projectSearch.styleSource,
      rowText: projectSearch.searchText,
      rowHash: projectSearch.embeddedTextHash,
      rowModel: projectSearch.embeddingModel,
      hasRow: sql<boolean>`${projectSearch.projectId} is not null`,
    })
    .from(projects)
    .leftJoin(projectSearch, eq(projectSearch.projectId, projects.id))
    .where(
      and(
        eq(projects.status, "published"),
        opts.projectIds?.length ? inArray(projects.id, opts.projectIds) : undefined,
        stale,
      ),
    )
    .limit(Math.min(opts.limit ?? 50, 200));
  if (targets.length === 0) return result;

  const ids = targets.map((t) => t.id);
  const tagRows = await db
    .select({ projectId: projectTags.projectId, slug: tags.slug, kind: tags.kind })
    .from(projectTags)
    .innerJoin(tags, eq(tags.id, projectTags.tagId))
    .where(inArray(projectTags.projectId, ids));

  type Row = {
    projectId: string;
    versionId: string | null;
    styleDescription: string;
    styleSource: "seed" | "ai" | "auto";
    searchText: string;
    /** keep: the stored embedding still matches; clear: it's stale; embed: make a new one. */
    plan: "keep" | "clear" | "embed";
    embedding?: number[];
  };
  const rows: Row[] = [];
  for (const t of targets) {
    try {
      const own = tagRows.filter((r) => r.projectId === t.id);
      const styles = own.filter((r) => r.kind === "style" || isStyleId(r.slug)).map((r) => r.slug);
      const topics = own.filter((r) => !styles.includes(r.slug)).map((r) => r.slug);

      let styleDescription = t.rowDescription ?? "";
      let styleSource: Row["styleSource"] = t.rowSource ?? "auto";
      const sameVersion = t.hasRow && t.rowVersionId === t.versionId;
      if (!sameVersion || !styleDescription) {
        const files = t.versionId ? await loadTextFiles(db, t.versionId) : [];
        const hints = styleHints(files);
        styleDescription = describeFromHints(hints.phrases);
        styleSource = "auto";
        if (opts.describer && files.length) {
          try {
            const written = cleanDescription(
              await opts.describer({
                title: t.title,
                description: t.description,
                hints: hints.phrases,
                code: files.map((f) => `/* ${f.path} */\n${f.text}`).join("\n\n"),
              }),
            );
            if (written.length >= 20) {
              styleDescription = written;
              styleSource = "ai";
              result.described++;
            }
          } catch {
            // Keep the hint-based description; a later version can try again.
          }
        }
      }

      const searchText = buildSearchText({
        title: t.title,
        description: t.description,
        category: t.category,
        toolUsed: t.toolUsed,
        styles,
        tags: topics,
        styleDescription,
      });
      const upToDate =
        t.hasRow &&
        t.rowHash === sha(searchText) &&
        (!opts.embedder || t.rowModel === opts.embedder.model);
      const plan: Row["plan"] = upToDate ? "keep" : opts.embedder ? "embed" : "clear";
      rows.push({
        projectId: t.id,
        versionId: t.versionId,
        styleDescription,
        styleSource,
        searchText,
        plan,
      });
    } catch {
      result.failed++;
    }
  }

  // Embed everything that needs it in one call.
  const toEmbed = rows.filter((r) => r.plan === "embed");
  if (opts.embedder && toEmbed.length) {
    try {
      const vectors = await opts.embedder.embed(toEmbed.map((r) => r.searchText));
      toEmbed.forEach((r, i) => {
        r.embedding = vectors[i];
        result.embedded++;
      });
    } catch {
      // Keyword search still works without embeddings, and the next run retries.
    }
  }

  for (const r of rows) {
    const base = {
      versionId: r.versionId,
      styleDescription: r.styleDescription,
      styleSource: r.styleSource,
      searchText: r.searchText,
    };
    const vectorColumns =
      r.plan === "keep"
        ? {}
        : r.embedding
          ? {
              embedding: r.embedding,
              embeddingModel: opts.embedder?.model ?? null,
              embeddedTextHash: sha(r.searchText),
            }
          : { embedding: null, embeddingModel: null, embeddedTextHash: null };
    const set = { ...base, ...vectorColumns };
    await db
      .insert(projectSearch)
      .values({ projectId: r.projectId, ...set })
      .onConflictDoUpdate({ target: projectSearch.projectId, set });
    result.indexed++;
  }
  return result;
}

/** The text files of a version (HTML, CSS, JS...), capped so huge uploads stay cheap. */
async function loadTextFiles(db: Db, versionId: string): Promise<{ path: string; text: string }[]> {
  const rows = await db
    .select({ path: projectFiles.path, size: projectFiles.size, content: blobs.content })
    .from(projectFiles)
    .innerJoin(blobs, eq(blobs.sha256, projectFiles.blobSha256))
    .where(eq(projectFiles.versionId, versionId));
  const decoder = new TextDecoder();
  const out: { path: string; text: string }[] = [];
  let total = 0;
  // Entry HTML and stylesheets first: they say the most about the look.
  const order = (p: string) => (/\.html?$/i.test(p) ? 0 : /\.css$/i.test(p) ? 1 : 2);
  for (const r of rows.sort(
    (a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path),
  )) {
    if (!TEXT_FILE.test(r.path) || !r.content) continue;
    if (total + r.size > MAX_CODE_BYTES) continue;
    total += r.size;
    out.push({ path: r.path, text: decoder.decode(r.content) });
  }
  return out;
}

/** Counts for the admin page. */
export async function indexStatus(
  db: Db,
): Promise<{ published: number; indexed: number; embedded: number }> {
  const [row] = await db
    .select({
      published: sql<number>`count(*)::int`,
      indexed: sql<number>`count(${projectSearch.projectId})::int`,
      embedded: sql<number>`count(${projectSearch.embedding})::int`,
    })
    .from(projects)
    .leftJoin(projectSearch, eq(projectSearch.projectId, projects.id))
    .where(eq(projects.status, "published"));
  return row ?? { published: 0, indexed: 0, embedded: 0 };
}
