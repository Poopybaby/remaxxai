import { describe, expect, it } from "vitest";
import { SEED_TEMPLATES } from "@/seed/catalog";
import { SEED_VIBES } from "@/seed/vibes";
import {
  keywordMatch,
  normalizeSimilarity,
  rankCandidates,
  rankSimilar,
  RANK_WEIGHTS,
  type Candidate,
} from "@/lib/search/rank";
import {
  buildSearchText,
  parseQuery,
  projectTerms,
  type IndexableProject,
} from "@/lib/search/text";
import { toTsQuery } from "@/lib/search/query";
import { hashVector } from "../helpers/embedder";

// The 29 starter templates are the fixture: real titles, tags and hand-written vibes.
const projects: (IndexableProject & { slug: string })[] = SEED_TEMPLATES.map((t) => ({
  slug: t.slug,
  title: t.title,
  description: t.description,
  category: t.category,
  toolUsed: t.tool,
  styles: t.styles,
  tags: t.tags.filter((x) => !(t.styles as string[]).includes(x)),
  styleDescription: SEED_VIBES[t.slug] ?? "",
}));

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

function candidates(q: string, opts: { vectors: boolean }): Candidate[] {
  const qv = hashVector(q);
  return projects.map((p, i) => ({
    id: p.slug,
    terms: projectTerms(p),
    similarity: opts.vectors ? cosine(qv, hashVector(buildSearchText(p))) : null,
    likeCount: 0,
    remixCount: 0,
    publishedAt: 1_000_000 - i,
  }));
}

const top = (q: string, vectors = false, n = 3) =>
  rankCandidates(parseQuery(q), candidates(q, { vectors }))
    .slice(0, n)
    .map((r) => r.id);

describe("parseQuery", () => {
  it("drops filler words, stems plurals and maps everyday words to filters", () => {
    const p = parseQuery("I want a dark glassmorphism dashboards site for my startup");
    expect(p.terms).toEqual(["dark", "glassmorphism", "dashboard", "startup"]);
    expect(p.styles).toEqual(["dark", "glassy"]);
    expect(p.categories).toEqual(["dashboard"]);
  });

  it("understands 8-bit, dark mode and tool names", () => {
    const p = parseQuery("8-bit game made with ChatGPT in dark mode");
    expect(p.styles).toEqual(expect.arrayContaining(["retro", "dark"]));
    expect(p.categories).toEqual(["game"]);
    expect(p.tools).toEqual(["chatgpt"]);
  });

  it("returns nothing for empty or filler-only queries", () => {
    expect(parseQuery("").terms).toEqual([]);
    expect(parseQuery("a site for me please").terms).toEqual([]);
  });
});

describe("toTsQuery", () => {
  it("ORs safe words and prefix-matches longer ones", () => {
    expect(toTsQuery(["dark", "ui", "glassy"])).toBe("dark:* | ui | glassy:*");
  });
  it("strips anything that could break the tsquery syntax", () => {
    expect(toTsQuery(["a&b", "c|d", "x"])).toBe("ab | cd");
    expect(toTsQuery(["!", "'"])).toBeNull();
  });
});

describe("rankCandidates on the starter templates", () => {
  it.each([
    ["dark glassy fintech dashboard", "ledgerline"],
    ["playful pastel booking site", "petal-and-pine"],
    ["neon retro arcade game", "arcade-snake"],
    ["calm editorial portfolio", "orbit-portfolio"],
    ["loud brutalist notes app", "brutal-notes"],
    ["elegant wedding invitation", "wedding-rsvp"],
  ])("“%s” puts %s first, with or without vectors", (q, expected) => {
    expect(top(q, false)[0]).toBe(expected);
    expect(top(q, true)[0]).toBe(expected);
  });

  it("explains matches with styles, category and tags", () => {
    const [first] = rankCandidates(
      parseQuery("dark glassy fintech dashboard"),
      candidates("dark glassy fintech dashboard", { vectors: false }),
    );
    expect(first?.reasons.map((r) => `${r.kind}:${r.label}`)).toEqual([
      "style:Dark",
      "style:Glassy",
      "category:Dashboard",
      "tag:fintech",
    ]);
  });

  it("finds matches by the look-and-feel text, not only by tags", () => {
    // "sea-glass" and "wellness" only appear in the Tidepool vibe and description.
    expect(top("sea glass wellness", false)[0]).toBe("tidepool-habits");
  });

  it("keeps a strong vibe match with no shared words, and drops weak ones", () => {
    const q = parseQuery("zzz");
    const base = { terms: projectTerms(projects[0]!), likeCount: 0, remixCount: 0, publishedAt: 0 };
    const ranked = rankCandidates(q, [
      { ...base, id: "close", similarity: 0.6 },
      { ...base, id: "weak", similarity: 0.2 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["close"]);
    expect(ranked[0]?.reasons).toEqual([{ kind: "vibe", label: "Close vibe" }]);
  });

  it("uses popularity only as a light tie-breaker", () => {
    const q = parseQuery("dark dashboard");
    const terms = projectTerms(projects.find((p) => p.slug === "ledgerline")!);
    const weakTerms = projectTerms(projects.find((p) => p.slug === "tip-split")!);
    const ranked = rankCandidates(q, [
      {
        id: "popular-but-partial",
        terms: weakTerms,
        similarity: null,
        likeCount: 5000,
        remixCount: 900,
        publishedAt: 0,
      },
      { id: "exact", terms, similarity: null, likeCount: 0, remixCount: 0, publishedAt: 0 },
    ]);
    expect(ranked[0]?.id).toBe("exact");
  });

  it("orders ties newest first and respects the limit", () => {
    const q = parseQuery("dark");
    const ranked = rankCandidates(q, candidates("dark", { vectors: false }), 3);
    expect(ranked).toHaveLength(3);
    const scores = ranked.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("never returns more than four reasons per result", () => {
    for (const r of rankCandidates(
      parseQuery("dark glassy neon retro bold minimal game dashboard"),
      candidates("x", { vectors: false }),
    )) {
      expect(r.reasons.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("keywordMatch", () => {
  it("scores full coverage as 1 and no overlap as 0", () => {
    const ledger = projectTerms(projects.find((p) => p.slug === "ledgerline")!);
    expect(keywordMatch(parseQuery("dark fintech"), ledger).coverage).toBe(1);
    expect(keywordMatch(parseQuery("wedding"), ledger).coverage).toBe(0);
  });
});

describe("normalizeSimilarity", () => {
  it("clamps to 0..1 between the configured thresholds", () => {
    expect(normalizeSimilarity(RANK_WEIGHTS.simLow - 0.1)).toBe(0);
    expect(normalizeSimilarity(RANK_WEIGHTS.simHigh + 0.1)).toBe(1);
    expect(normalizeSimilarity((RANK_WEIGHTS.simLow + RANK_WEIGHTS.simHigh) / 2)).toBeCloseTo(0.5);
  });
});

describe("rankSimilar", () => {
  const asSimilar = (slug: string) => {
    const p = projects.find((x) => x.slug === slug)!;
    return {
      id: slug,
      terms: projectTerms(p),
      similarity: null,
      likeCount: 0,
      remixCount: 0,
      publishedAt: 0,
      styles: p.styles,
      tags: p.tags,
      category: p.category,
    };
  };

  it("without embeddings, ranks by shared styles, tags and category, and says why", () => {
    const source = projects.find((p) => p.slug === "arcade-snake")!;
    const ranked = rankSimilar(
      source,
      ["synthwave-countdown", "memory-match", "wedding-rsvp", "pixel-pantry"].map(asSimilar),
    );
    expect(ranked[0]?.id).toBe("synthwave-countdown");
    expect(ranked[0]?.reasons.map((r) => r.label)).toEqual(["Neon", "Retro", "Dark"]);
    expect(ranked.map((r) => r.id)).not.toContain("wedding-rsvp");
  });

  it("with embeddings, drops look-alikes that share nothing unless the resemblance is strong", () => {
    const source = projects.find((p) => p.slug === "arcade-snake")!;
    const unrelated = asSimilar("wedding-rsvp");
    const ranked = rankSimilar(source, [
      { ...unrelated, id: "weak", similarity: 0.5 },
      { ...unrelated, id: "strong", similarity: 0.8 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["strong"]);
    expect(ranked[0]?.reasons).toEqual([{ kind: "vibe", label: "Close vibe" }]);
  });
});
