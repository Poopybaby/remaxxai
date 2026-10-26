import { describe, expect, it } from "vitest";
import { encodeHandoff, parseHandoff } from "@/lib/editor/first-prompt";

describe("Create → editor hand-off", () => {
  it("round-trips a prompt to send right away, with its model and images", () => {
    const raw = encodeHandoff({
      prompt: "A taco truck menu",
      send: true,
      modelId: "gpt-mini",
      images: [{ base64: "AAAA" }],
    });
    expect(parseHandoff(raw)).toEqual({
      prompt: "A taco truck menu",
      send: true,
      modelId: "gpt-mini",
      images: [{ base64: "AAAA" }],
    });
  });

  it("treats plain text (the older format) as words to fill in, never to send", () => {
    expect(parseHandoff("  A barbershop page ")).toEqual({
      prompt: "A barbershop page",
      send: false,
    });
  });

  it("ignores anything malformed, empty or tampered with", () => {
    expect(parseHandoff("")).toBeNull();
    expect(parseHandoff("{not json")).toBeNull();
    expect(parseHandoff(JSON.stringify({ v: 2, prompt: "x", send: true }))).toBeNull();
    expect(parseHandoff(JSON.stringify({ v: 1, prompt: "   ", send: true }))).toBeNull();
    const odd = parseHandoff(
      JSON.stringify({
        v: 1,
        prompt: "x",
        send: "yes",
        images: [{ base64: 1 }, "a", { base64: "ok" }],
      }),
    );
    expect(odd).toEqual({
      prompt: "x",
      send: false,
      modelId: undefined,
      images: [{ base64: "ok" }],
    });
  });

  it("caps prompt length and image count", () => {
    const h = parseHandoff(
      encodeHandoff({
        prompt: "x".repeat(5000),
        send: true,
        images: Array.from({ length: 5 }, () => ({ base64: "A" })),
      }),
    );
    expect(h?.prompt).toHaveLength(2000);
    expect(h?.images).toHaveLength(3);
  });
});
