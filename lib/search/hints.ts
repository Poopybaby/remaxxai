/**
 * Reads a template's HTML and CSS for visual clues (dark or light background, frosted glass, hard
 * shadows, serif type...) without running anything. Feeds the AI describer, and stands in for it
 * when no AI key is set. Pure and deterministic, so it's cheap to test.
 */
import type { StyleId } from "@/config/taxonomy";

export type StyleHints = { phrases: string[]; styles: StyleId[] };

type SourceFile = { path: string; text: string };

const COLOR = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;

/** Collects the CSS a page uses: <style> blocks, inline style="" attributes and .css files. */
export function collectCss(files: SourceFile[]): string {
  const parts: string[] = [];
  for (const f of files) {
    if (/\.css$/i.test(f.path)) parts.push(f.text);
    if (/\.html?$/i.test(f.path)) {
      for (const m of f.text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) parts.push(m[1] ?? "");
      for (const m of f.text.matchAll(/\sstyle="([^"]*)"/gi)) parts.push(`x{${m[1] ?? ""}}`);
    }
  }
  return parts.join("\n");
}

type Rgb = { r: number; g: number; b: number };

export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex.slice(0, 3)].map((c) => c + c).join("");
    if (hex.length === 8) hex = hex.slice(0, 6);
    if (hex.length !== 6) return null;
    const n = Number.parseInt(hex, 16);
    return Number.isNaN(n) ? null : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  const hsl = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  return null;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function saturationLightness({ r, g, b }: Rgb): { s: number; l: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}

/** CSS custom properties, so `background: var(--bg)` can be followed to a color. */
function cssVariables(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    if (m[1] && m[2] && !vars.has(m[1])) vars.set(m[1], m[2].trim());
  }
  return vars;
}

function resolveVars(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 4) return value;
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g,
    (_, name: string, fallback?: string) =>
      resolveVars(vars.get(name) ?? fallback ?? "", vars, depth + 1),
  );
}

/** The page background: from html/body/:root/main rules, else the first full-page container. */
function pageBackground(css: string, vars: Map<string, string>): Rgb | null {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const preferred = rules.filter((m) => /(^|[\s,])(html|body|:root|main)\b/.test(m[1] ?? ""));
  for (const m of [...preferred, ...rules]) {
    const decl = (m[2] ?? "").match(/background(?:-color)?\s*:\s*([^;]+)/i);
    if (!decl?.[1]) continue;
    const value = resolveVars(decl[1], vars);
    const color = value.match(COLOR)?.[0];
    if (color) return parseColor(color);
    if (preferred.includes(m)) continue;
  }
  return null;
}

/** Visual clues found in the code, as plain phrases plus likely style tags. */
export function styleHints(files: SourceFile[]): StyleHints {
  const css = collectCss(files);
  const html = files
    .filter((f) => /\.html?$/i.test(f.path))
    .map((f) => f.text)
    .join("\n");
  const js = files
    .filter((f) => /\.m?js$/i.test(f.path))
    .map((f) => f.text)
    .join("\n");
  const vars = cssVariables(css);
  // Follow var(--x) everywhere so `border: var(--edge)` counts like a literal value.
  const rcss = resolveVars(css, vars);
  const phrases: string[] = [];
  const styles = new Set<StyleId>();
  const add = (phrase: string, ...ids: StyleId[]) => {
    if (!phrases.includes(phrase)) phrases.push(phrase);
    for (const id of ids) styles.add(id);
  };

  const bg = pageBackground(css, vars);
  if (bg) {
    const lum = luminance(bg);
    if (lum < 0.08) add("dark background", "dark");
    else if (lum > 0.7) add("light background", "light");
    else add("mid-tone background");
  }

  const colors = [...rcss.matchAll(COLOR)]
    .map((m) => parseColor(m[0]))
    .filter((c): c is Rgb => c !== null)
    .map(saturationLightness);
  const vivid = colors.filter((c) => c.s > 0.75 && c.l > 0.4 && c.l < 0.7).length;
  const pastel = colors.filter((c) => c.s > 0.25 && c.l > 0.78 && c.l < 0.96).length;
  if (colors.length >= 4 && pastel / colors.length > 0.3) add("soft pastel colors", "pastel");
  if (colors.length >= 4 && vivid / colors.length > 0.35) add("vivid saturated colors", "bold");
  if (colors.length > 0 && colors.every((c) => c.s < 0.12)) add("monochrome palette", "minimal");

  if (/backdrop-filter\s*:\s*[^;]*blur/i.test(rcss)) add("frosted glass panels", "glassy");
  if (/(?:linear|radial|conic)-gradient/i.test(rcss)) add("gradients");
  // Hard offset shadows have no blur: "4px 4px 0" or "6px 6px 0 #000".
  if (/box-shadow\s*:\s*-?\d+px\s+-?\d+px\s+0(?:px)?[\s;#a-z(]/i.test(rcss)) {
    add("hard offset shadows", "brutalist");
  }
  const thick =
    rcss.match(/border(?:-(?:top|right|bottom|left))?\s*:\s*(?:[3-9]|1\d)px\s+solid/gi) ?? [];
  if (thick.length >= 3) add("thick borders", "brutalist");
  if (/(?:text|box)-shadow\s*:[^;]*0\s+0\s+(?:[1-9]\d)px/i.test(rcss)) add("neon glow", "neon");
  if (/text-transform\s*:\s*uppercase/i.test(rcss)) add("uppercase type");
  if (
    /font-size\s*:\s*(?:clamp\([^)]*(?:1\d|[2-9]\d)vw|(?:[6-9]|1\d)(?:\.\d+)?rem|(?:9\d|1\d\d)px)/i.test(
      rcss,
    )
  ) {
    add("giant display type", "bold");
  }
  const families = [...rcss.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) =>
    (m[1] ?? "").toLowerCase(),
  );
  if (
    families.some((f) => /georgia|playfair|garamond|times|fraunces|(?<!sans-)\bserif\b/.test(f))
  ) {
    add("serif type", "editorial");
  }
  if (families.some((f) => /mono|courier|consolas/.test(f))) add("monospace type");
  if (/press start|pixel|image-rendering\s*:\s*pixelated/i.test(rcss + html))
    add("pixel-art look", "retro");
  if (/border-radius\s*:\s*(?:999|50%|[3-9]\dpx|[2-9]rem)/i.test(rcss)) add("rounded, soft shapes");
  if (/border-radius\s*:\s*0[;\s}]/i.test(rcss) && !/border-radius\s*:\s*[1-9]/i.test(rcss)) {
    add("sharp square corners");
  }
  if (/@keyframes/i.test(rcss)) add("animated elements");
  if (/<canvas\b/i.test(html)) add("canvas graphics");
  if ((html.match(/<svg\b/gi) ?? []).length >= 2) add("SVG illustrations");
  if (/display\s*:\s*grid/i.test(rcss)) add("grid layout");
  if (/draggable|dragstart/i.test(html + js)) add("drag and drop");
  if (/localStorage/i.test(js + html)) add("saves to the browser");

  return { phrases, styles: [...styles] };
}
