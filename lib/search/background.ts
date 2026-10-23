import "server-only";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getDescriber, getEmbedder } from "./ai";
import { indexProjects, type IndexResult } from "./indexer";

let running: Promise<IndexResult> | null = null;

/**
 * Brings the search index up to date. Safe to call from `after()` on any request: concurrent calls
 * on the same server share one run, and errors are logged, never thrown at the page.
 */
export function refreshSearchIndex(projectIds?: string[]): Promise<IndexResult | null> {
  if (!isDbConfigured()) return Promise.resolve(null);
  if (running && !projectIds) return running;
  const run = indexProjects(getDb(), {
    embedder: getEmbedder(),
    describer: getDescriber(),
    projectIds,
    limit: projectIds ? projectIds.length : 100,
  });
  if (!projectIds) {
    running = run.finally(() => {
      running = null;
    });
  }
  return run.catch((err: unknown) => {
    console.error("[search] indexing failed", err instanceof Error ? err.message : err);
    return null;
  });
}
