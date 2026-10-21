import { describe, expect, it } from "vitest";
import { normalizeHandle, suggestHandle, validateHandle } from "@/lib/auth/handles";

describe("validateHandle", () => {
  it.each(["juno", "kai_2", "a1b", "x".repeat(30), "remix_lab"])("accepts %s", (h) => {
    expect(validateHandle(h)).toEqual({ ok: true, handle: h });
  });

  it("normalizes case, whitespace and a leading @", () => {
    expect(validateHandle("  @Juno_Maker ")).toEqual({ ok: true, handle: "juno_maker" });
    expect(normalizeHandle("@@KAI")).toBe("kai");
  });

  it.each([
    ["ab", "too_short"],
    ["x".repeat(31), "too_long"],
    ["_juno", "invalid_chars"],
    ["juno_", "invalid_chars"],
    ["ju__no", "invalid_chars"],
    ["ju-no", "invalid_chars"],
    ["ju.no", "invalid_chars"],
    ["jüno", "invalid_chars"],
    ["admin", "reserved"],
    ["Settings", "reserved"],
    ["remaxx", "reserved"],
    ["usercontent", "reserved"],
  ])("rejects %s as %s", (h, error) => {
    expect(validateHandle(h)).toEqual({ ok: false, error });
  });
});

describe("suggestHandle", () => {
  it("builds a handle from an email local part", () => {
    expect(suggestHandle("Juno.Rivera+test@example.com")).toBe("juno_rivera_test");
  });

  it("strips accents and symbols", () => {
    expect(suggestHandle("Zoë Ünal")).toBe("zoe_unal");
  });

  it("pads very short names", () => {
    expect(suggestHandle("al@example.com")).toBe("al_maker");
  });

  it("works around reserved words", () => {
    expect(suggestHandle("admin@example.com")).toBe("admin_1");
  });

  it("returns null when nothing usable remains", () => {
    expect(suggestHandle("!!!@example.com")).toBeNull();
  });

  it("always returns something validateHandle accepts", () => {
    for (const s of ["Mary Jane Watson-Parker the Third of Queens NYC", "__x__", "a_b", "123456"]) {
      const h = suggestHandle(s);
      if (h !== null) expect(validateHandle(h).ok).toBe(true);
    }
  });
});
