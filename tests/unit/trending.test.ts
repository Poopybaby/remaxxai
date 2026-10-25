import { describe, expect, it } from "vitest";
import { trendingScore } from "@/lib/projects/queries";

describe("trendingScore", () => {
  it("ranks fresh activity above the same activity later", () => {
    const fresh = trendingScore({ likes: 5, saves: 1, remixes: 1, ageHours: 6 });
    const old = trendingScore({ likes: 5, saves: 1, remixes: 1, ageHours: 24 * 14 });
    expect(fresh).toBeGreaterThan(old);
  });

  it("weights remixes above saves above likes", () => {
    const base = { likes: 0, saves: 0, remixes: 0, ageHours: 24 };
    const like = trendingScore({ ...base, likes: 1 });
    const save = trendingScore({ ...base, saves: 1 });
    const remix = trendingScore({ ...base, remixes: 1 });
    expect(remix).toBeGreaterThan(save);
    expect(save).toBeGreaterThan(like);
  });

  it("lets a big older hit outrank a quiet new upload", () => {
    const hit = trendingScore({ likes: 300, saves: 80, remixes: 40, ageHours: 24 * 3 });
    const quiet = trendingScore({ likes: 0, saves: 0, remixes: 0, ageHours: 1 });
    expect(hit).toBeGreaterThan(quiet);
  });
});
