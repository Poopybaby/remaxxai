import { stem, words } from "@/lib/search/text";
import type { Embedder } from "@/lib/search/indexer";

/**
 * A deterministic stand-in for OpenAI embeddings: each word is hashed into one of 1536 buckets,
 * then the vector is normalized. Texts that share words get high cosine similarity, which is
 * enough to exercise vector search and ranking without the network.
 */
export function hashVector(text: string, dims = 1536): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const w of words(text).map(stem)) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    v[Math.abs(h) % dims]! += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export function fakeEmbedder(opts: { fail?: boolean; model?: string } = {}): Embedder & {
  calls: string[][];
} {
  const calls: string[][] = [];
  return {
    model: opts.model ?? "fake-embedding",
    calls,
    async embed(texts) {
      calls.push(texts);
      if (opts.fail) throw new Error("embedding service down");
      return texts.map((t) => hashVector(t));
    },
  };
}
