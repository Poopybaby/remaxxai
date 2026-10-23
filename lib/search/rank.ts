/**
 * Hybrid ranking for vibe search, and the "why it matched" reasons shown on each result.
 * Pure: candidates come in with their terms and (when available) embedding similarity,
 * ranked results go out. tests/unit/search-rank.test.ts pins its behaviour on a fixture set.
 */
import { CATEGORIES, STYLES, TOOLS, labelFor } from "@/config/taxonomy";
import type { ParsedQuery, ProjectTerms } from "./text";

export type MatchReason = {
  kind: "style" | "category" | "tag" | "title" | "tool" | "text" | "vibe";
  label: string;
};

export type Candidate = {
  id: string;
  terms: ProjectTerms;
  /** Cosine similarity between the query and the project's embedding, if both exist. */
  similarity: number | null;
  likeCount: number;
  remixCount: number;
  /** Newer first on ties. Milliseconds since epoch. */
  publishedAt: number;
};

export type Ranked = { id: string; score: number; reasons: MatchReason[] };

/** Weights in one place so tuning is a one-line change. */
export const RANK_WEIGHTS = {
  semantic: 0.55,
  keyword: 0.4,
  popularity: 0.05,
  /** Similarity at or below this counts as no resemblance; at or above `simHigh` as a perfect one. */
  simLow: 0.18,
  simHigh: 0.62,
  /** A result with no word matches needs at least this much vibe resemblance to be shown. */
  minVibeOnly: 0.35,
} as const;

const W = RANK_WEIGHTS;

/** Maps raw cosine similarity onto 0–1 using thresholds that suit text-embedding-3-small. */
export function normalizeSimilarity(sim: number): number {
  return Math.max(0, Math.min(1, (sim - W.simLow) / (W.simHigh - W.simLow)));
}

function popularity(c: Candidate): number {
  return Math.min(1, Math.log1p(c.likeCount + 2 * c.remixCount) / Math.log1p(50));
}

/** How much of the query the project covers (0–1), and the reasons why. */
export function keywordMatch(
  q: ParsedQuery,
  t: ProjectTerms,
): { coverage: number; reasons: MatchReason[] } {
  if (q.terms.length === 0) return { coverage: 0, reasons: [] };
  let total = 0;
  const reasons: MatchReason[] = [];
  const say = (r: MatchReason) => {
    if (!reasons.some((x) => x.kind === r.kind && x.label === r.label)) reasons.push(r);
  };
  for (const term of q.terms) {
    const m = q.meanings[term] ?? {};
    if (m.style && t.styles.has(m.style)) {
      total += 1;
      say({ kind: "style", label: labelFor(STYLES, m.style) });
    } else if (m.category && t.category === m.category) {
      total += 1;
      say({ kind: "category", label: labelFor(CATEGORIES, m.category) });
    } else if (t.tags.has(term)) {
      total += 1;
      say({ kind: "tag", label: term });
    } else if (t.title.has(term)) {
      total += 0.9;
      say({ kind: "title", label: term });
    } else if (m.tool && t.tool === m.tool) {
      total += 0.8;
      say({ kind: "tool", label: labelFor(TOOLS, m.tool) });
    } else if (t.body.has(term)) {
      total += 0.6;
      say({ kind: "text", label: term });
    }
  }
  return { coverage: total / q.terms.length, reasons };
}

const REASON_ORDER: MatchReason["kind"][] = [
  "style",
  "category",
  "tag",
  "title",
  "tool",
  "text",
  "vibe",
];

/** Ranks candidates for a query. With `semantic` false (no embeddings), words alone decide. */
export function rankCandidates(q: ParsedQuery, candidates: Candidate[], limit = 48): Ranked[] {
  const out: (Ranked & { publishedAt: number })[] = [];
  for (const c of candidates) {
    const { coverage, reasons } = keywordMatch(q, c.terms);
    const sem = c.similarity === null ? null : normalizeSimilarity(c.similarity);
    if (sem === null && coverage === 0) continue;
    if (sem !== null && coverage === 0 && sem < W.minVibeOnly) continue;

    const score =
      sem === null
        ? (W.semantic + W.keyword) * coverage + W.popularity * popularity(c)
        : W.semantic * sem + W.keyword * coverage + W.popularity * popularity(c);

    if (sem !== null && sem >= W.minVibeOnly) {
      reasons.push({ kind: "vibe", label: sem >= 0.6 ? "Close vibe" : "Similar vibe" });
    }
    reasons.sort((a, b) => REASON_ORDER.indexOf(a.kind) - REASON_ORDER.indexOf(b.kind));
    out.push({ id: c.id, score, reasons: reasons.slice(0, 4), publishedAt: c.publishedAt });
  }
  out.sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);
  return out.slice(0, limit).map(({ id, score, reasons }) => ({ id, score, reasons }));
}

/**
 * Two template descriptions resemble each other far more than a short query resembles one, so
 * "More like this" uses its own, stricter similarity scale.
 */
export const SIMILAR_WEIGHTS = {
  simLow: 0.35,
  simHigh: 0.8,
  /** Without shared styles, tags or category, only a strong resemblance qualifies. */
  minVibeOnly: 0.55,
  minScore: 0.12,
} as const;

export type SimilarCandidate = Candidate & { styles: string[]; tags: string[]; category: string };

/**
 * "More like this": embedding similarity when both projects have one, plus shared styles,
 * tags and category so it still works (and explains itself) without embeddings.
 */
export function rankSimilar(
  source: { styles: string[]; tags: string[]; category: string },
  candidates: SimilarCandidate[],
  limit = 8,
): Ranked[] {
  const srcFeatures = new Set([
    ...source.styles.map((s) => `s:${s}`),
    ...source.tags.map((t) => `t:${t}`),
    `c:${source.category}`,
  ]);
  const out: (Ranked & { publishedAt: number })[] = [];
  for (const c of candidates) {
    const features = new Set([
      ...c.styles.map((s) => `s:${s}`),
      ...c.tags.map((t) => `t:${t}`),
      `c:${c.category}`,
    ]);
    const shared = [...features].filter((f) => srcFeatures.has(f));
    const union = new Set([...features, ...srcFeatures]).size;
    const overlap = union ? shared.length / union : 0;
    const S = SIMILAR_WEIGHTS;
    const sem =
      c.similarity === null
        ? null
        : Math.max(0, Math.min(1, (c.similarity - S.simLow) / (S.simHigh - S.simLow)));
    if (shared.length === 0 && (sem === null || sem < S.minVibeOnly)) continue;
    const score = sem === null ? overlap : 0.6 * sem + 0.4 * overlap;
    if (score < S.minScore) continue;

    const reasons: MatchReason[] = [];
    for (const f of shared) {
      if (f.startsWith("s:")) reasons.push({ kind: "style", label: labelFor(STYLES, f.slice(2)) });
    }
    if (shared.includes(`c:${source.category}`)) {
      reasons.push({ kind: "category", label: labelFor(CATEGORIES, source.category) });
    }
    for (const f of shared)
      if (f.startsWith("t:")) reasons.push({ kind: "tag", label: f.slice(2) });
    if (sem !== null && sem >= W.minVibeOnly) {
      reasons.push({ kind: "vibe", label: sem >= 0.6 ? "Close vibe" : "Similar vibe" });
    }
    out.push({ id: c.id, score, reasons: reasons.slice(0, 3), publishedAt: c.publishedAt });
  }
  out.sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);
  return out.slice(0, limit).map(({ id, score, reasons }) => ({ id, score, reasons }));
}
