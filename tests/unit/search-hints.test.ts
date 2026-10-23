import { describe, expect, it } from "vitest";
import { luminance, parseColor, styleHints } from "@/lib/search/hints";
import { cleanDescription, describeFromHints } from "@/lib/search/indexer";

const page = (css: string, body = "") => [
  {
    path: "index.html",
    text: `<html><head><style>${css}</style></head><body>${body}</body></html>`,
  },
];

describe("styleHints", () => {
  it("reads a dark background through CSS variables", () => {
    const h = styleHints(page(":root{--bg:#0b0b14} body{background:var(--bg);color:#fff}"));
    expect(h.phrases).toContain("dark background");
    expect(h.styles).toContain("dark");
  });

  it("spots frosted glass, hard shadows and thick borders", () => {
    const h = styleHints(
      page(
        `.a{backdrop-filter: blur(12px)} .b{box-shadow: 6px 6px 0 #000}
         .c{border:4px solid #000} .d{border:4px solid #000} .e{border:5px solid red}`,
      ),
    );
    expect(h.phrases).toEqual(
      expect.arrayContaining(["frosted glass panels", "hard offset shadows", "thick borders"]),
    );
    expect(h.styles).toEqual(expect.arrayContaining(["glassy", "brutalist"]));
  });

  it("doesn't mistake sans-serif for serif", () => {
    expect(styleHints(page("body{font-family: Inter, sans-serif}")).phrases).not.toContain(
      "serif type",
    );
    expect(styleHints(page("h1{font-family: Georgia, serif}")).phrases).toContain("serif type");
  });

  it("reads separate CSS files and inline styles", () => {
    const h = styleHints([
      { path: "index.html", text: '<div style="background: linear-gradient(red, blue)"></div>' },
      { path: "styles.css", text: "body{background:#ffffff}" },
    ]);
    expect(h.phrases).toEqual(expect.arrayContaining(["light background", "gradients"]));
  });

  it("returns nothing for files with no styling", () => {
    expect(styleHints([{ path: "notes.txt", text: "hello" }])).toEqual({ phrases: [], styles: [] });
  });
});

describe("colors", () => {
  it("parses hex, rgb and hsl", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("rgba(10, 20, 30, .5)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("nonsense")).toBeNull();
  });
  it("computes luminance from black to white", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1);
  });
});

describe("descriptions", () => {
  it("turns hints into a sentence", () => {
    expect(describeFromHints(["dark background", "neon glow"])).toBe("Dark background, neon glow.");
    expect(describeFromHints([])).toBe("");
  });
  it("strips markup, links and code from model output and caps the length", () => {
    const dirty =
      "**Dark** <b>glassy</b> look. See https://evil.example ```js\nalert(1)\n``` Calm.";
    expect(cleanDescription(dirty)).toBe("Dark glassy look. See Calm.");
    expect(cleanDescription("x".repeat(2000))).toHaveLength(600);
  });
});
