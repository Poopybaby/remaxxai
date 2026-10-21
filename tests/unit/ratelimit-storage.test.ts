import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/lib/ratelimit/memory";
import { blobKey, isSha256Hex, ownedImageKey, sha256Hex } from "@/lib/storage/keys";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit, then blocks until the window slides", () => {
    let now = 1_000_000;
    const limiter = new MemoryRateLimiter(() => now);
    const rule = { limit: 3, windowMs: 60_000 };

    expect(limiter.check("ip", rule)).toMatchObject({ success: true, remaining: 2 });
    now += 1_000;
    expect(limiter.check("ip", rule)).toMatchObject({ success: true, remaining: 1 });
    now += 1_000;
    expect(limiter.check("ip", rule)).toMatchObject({ success: true, remaining: 0 });
    const blocked = limiter.check("ip", rule);
    expect(blocked.success).toBe(false);
    expect(blocked.resetAt).toBe(1_000_000 + 60_000);

    // Blocked attempts don't extend the window.
    now = 1_000_000 + 60_001;
    expect(limiter.check("ip", rule).success).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = new MemoryRateLimiter(() => 0);
    const rule = { limit: 1, windowMs: 1000 };
    expect(limiter.check("a", rule).success).toBe(true);
    expect(limiter.check("a", rule).success).toBe(false);
    expect(limiter.check("b", rule).success).toBe(true);
  });
});

describe("storage keys", () => {
  it("hashes bytes with SHA-256", async () => {
    // Well-known digest of "abc".
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("identical bytes produce identical keys (dedupe across remixes)", async () => {
    const a = await sha256Hex(new TextEncoder().encode("<h1>hi</h1>"));
    const b = await sha256Hex(new TextEncoder().encode("<h1>hi</h1>"));
    expect(blobKey(a)).toBe(blobKey(b));
  });

  it("fans keys out by prefix", () => {
    const sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(blobKey(sha)).toBe(`blobs/ba/78/${sha}`);
  });

  it("rejects anything that isn't a digest (no path traversal through keys)", () => {
    expect(isSha256Hex("../../etc/passwd")).toBe(false);
    expect(() => blobKey("../../etc/passwd")).toThrow();
    expect(() =>
      blobKey("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"),
    ).toThrow();
  });

  it("builds owner-scoped image keys", () => {
    const sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const owner = "11111111-1111-4111-8111-111111111111";
    expect(ownedImageKey(owner, sha, "png")).toBe(`${owner}/${sha}.png`);
    expect(() => ownedImageKey("../x", sha, "png")).toThrow();
  });
});
