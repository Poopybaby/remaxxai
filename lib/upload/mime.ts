/**
 * File types a template may contain. Anything not listed is rejected. Static sites only:
 * source files that need a build step (.jsx, .tsx, .ts, .vue, .svelte) are refused with advice.
 */

type TypeInfo = { mime: string; text: boolean; magic?: (b: Uint8Array) => boolean };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((v, i) => b[offset + i] === v);

const PNG = (b: Uint8Array) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = (b: Uint8Array) => startsWith(b, [0xff, 0xd8, 0xff]);
const GIF = (b: Uint8Array) => startsWith(b, [0x47, 0x49, 0x46, 0x38]);
const WEBP = (b: Uint8Array) =>
  startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8);
const AVIF = (b: Uint8Array) => startsWith(b, [0x66, 0x74, 0x79, 0x70], 4);
const ICO = (b: Uint8Array) => startsWith(b, [0x00, 0x00, 0x01, 0x00]);
const WOFF = (b: Uint8Array) => startsWith(b, [0x77, 0x4f, 0x46, 0x46]);
const WOFF2 = (b: Uint8Array) => startsWith(b, [0x77, 0x4f, 0x46, 0x32]);
const TTF = (b: Uint8Array) =>
  startsWith(b, [0x00, 0x01, 0x00, 0x00]) || startsWith(b, [0x74, 0x72, 0x75, 0x65]);
const OTF = (b: Uint8Array) => startsWith(b, [0x4f, 0x54, 0x54, 0x4f]);
const MP3 = (b: Uint8Array) =>
  startsWith(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0);
const OGG = (b: Uint8Array) => startsWith(b, [0x4f, 0x67, 0x67, 0x53]);
const WAV = (b: Uint8Array) =>
  startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x41, 0x56, 0x45], 8);
const MP4 = (b: Uint8Array) => startsWith(b, [0x66, 0x74, 0x79, 0x70], 4);
const WEBM = (b: Uint8Array) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]);

const TYPES: Record<string, TypeInfo> = {
  html: { mime: "text/html; charset=utf-8", text: true },
  htm: { mime: "text/html; charset=utf-8", text: true },
  css: { mime: "text/css; charset=utf-8", text: true },
  js: { mime: "text/javascript; charset=utf-8", text: true },
  mjs: { mime: "text/javascript; charset=utf-8", text: true },
  json: { mime: "application/json; charset=utf-8", text: true },
  map: { mime: "application/json; charset=utf-8", text: true },
  webmanifest: { mime: "application/manifest+json; charset=utf-8", text: true },
  txt: { mime: "text/plain; charset=utf-8", text: true },
  md: { mime: "text/markdown; charset=utf-8", text: true },
  csv: { mime: "text/csv; charset=utf-8", text: true },
  xml: { mime: "application/xml; charset=utf-8", text: true },
  svg: { mime: "image/svg+xml", text: true },
  png: { mime: "image/png", text: false, magic: PNG },
  jpg: { mime: "image/jpeg", text: false, magic: JPEG },
  jpeg: { mime: "image/jpeg", text: false, magic: JPEG },
  gif: { mime: "image/gif", text: false, magic: GIF },
  webp: { mime: "image/webp", text: false, magic: WEBP },
  avif: { mime: "image/avif", text: false, magic: AVIF },
  ico: { mime: "image/x-icon", text: false, magic: ICO },
  woff: { mime: "font/woff", text: false, magic: WOFF },
  woff2: { mime: "font/woff2", text: false, magic: WOFF2 },
  ttf: { mime: "font/ttf", text: false, magic: TTF },
  otf: { mime: "font/otf", text: false, magic: OTF },
  mp3: { mime: "audio/mpeg", text: false, magic: MP3 },
  ogg: { mime: "audio/ogg", text: false, magic: OGG },
  wav: { mime: "audio/wav", text: false, magic: WAV },
  mp4: { mime: "video/mp4", text: false, magic: MP4 },
  webm: { mime: "video/webm", text: false, magic: WEBM },
};

/** Extensionless files that are fine to include (treated as plain text). */
const PLAIN_NAMES = new Set(["license", "licence", "readme", "notice", "authors", "changelog"]);

/** Source files that only work after a build step. */
export const NEEDS_BUILD_EXTENSIONS = new Set([
  "jsx",
  "tsx",
  "ts",
  "vue",
  "svelte",
  "astro",
  "scss",
  "sass",
  "less",
]);

export function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function typeFor(path: string): TypeInfo | null {
  const ext = extensionOf(path);
  if (ext) return TYPES[ext] ?? null;
  const name = (path.split("/").pop() ?? "").toLowerCase();
  return PLAIN_NAMES.has(name) ? { mime: "text/plain; charset=utf-8", text: true } : null;
}

export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

/** Cover images: raster only (no SVG), checked by content, not just the name. */
export function detectCoverType(
  bytes: Uint8Array,
): { mime: string; ext: "png" | "jpg" | "webp" | "gif" } | null {
  if (PNG(bytes)) return { mime: "image/png", ext: "png" };
  if (JPEG(bytes)) return { mime: "image/jpeg", ext: "jpg" };
  if (WEBP(bytes)) return { mime: "image/webp", ext: "webp" };
  if (GIF(bytes)) return { mime: "image/gif", ext: "gif" };
  return null;
}
