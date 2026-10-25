/**
 * Share images (Open Graph / social cards), rendered with next/og. 1200×630, the brand's dark
 * look. Images are fetched from our own public URLs, so this works the same for uploaded covers
 * (/media/...) and seed covers (/seed/covers/...).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const INK = "#0f0d1e";
const PANEL = "#1b1830";
const MAGENTA = "#ff3dcb";
const CYAN = "#3de0ff";
const MUTED = "#a9a3c7";

type FontOption = { name: string; data: ArrayBuffer; weight: 400 | 900; style: "normal" };
let fontsPromise: Promise<FontOption[]> | null = null;

/** Archivo (SIL OFL, see assets/og/Archivo-OFL.txt): static cuts of the site's own font. */
function ogFonts(): Promise<FontOption[]> {
  fontsPromise ??= Promise.all(
    (
      [
        ["Archivo-Regular.ttf", 400],
        ["Archivo-Black.ttf", 900],
      ] as const
    ).map(async ([file, weight]) => {
      const buf = await readFile(path.join(process.cwd(), "assets/og", file));
      return {
        name: "Archivo",
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight,
        style: "normal" as const,
      };
    }),
  ).catch((err: unknown) => {
    // Fall back to the built-in font rather than failing the image.
    console.error("[og.fonts]", err);
    fontsPromise = null;
    return [];
  });
  return fontsPromise;
}

async function render(node: React.ReactElement): Promise<ImageResponse> {
  return new ImageResponse(node, { ...OG_SIZE, fonts: await ogFonts() });
}

/** Our own image as a data URL, or null (the renderer only reads PNG, JPEG and GIF). */
export async function loadImage(path: string | null): Promise<string | null> {
  if (!path || !path.startsWith("/")) return null;
  try {
    const res = await fetch(new URL(path, siteConfig.appUrl), {
      signal: AbortSignal.timeout(4000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpeg|gif)$/.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > 3 * 1024 * 1024) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <div style={{ display: "flex", fontSize: size, fontWeight: 900, letterSpacing: -1 }}>
      <span style={{ color: "#fff" }}>REMA</span>
      <span style={{ color: MAGENTA }}>XX</span>
    </div>
  );
}

export async function siteCard(): Promise<ImageResponse> {
  return render(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: `radial-gradient(circle at 85% 15%, ${MAGENTA}55, transparent 45%), radial-gradient(circle at 10% 90%, ${CYAN}40, transparent 45%), ${INK}`,
        color: "#fff",
        fontFamily: "Archivo",
      }}
    >
      <Wordmark size={56} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.02, maxWidth: 900 }}>
          Remix what inspires you.
        </div>
        <div style={{ fontSize: 32, color: MUTED, maxWidth: 900 }}>
          Browse AI-built sites and tools, remix them by describing what you want, and publish your
          version.
        </div>
      </div>
    </div>,
  );
}

export async function projectCard(p: {
  title: string;
  handle: string;
  license: string;
  cover: string | null;
  remixedFrom: string | null;
}): Promise<ImageResponse> {
  return render(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: INK,
        color: "#fff",
        fontFamily: "Archivo",
      }}
    >
      <div
        style={{
          width: 560,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
        }}
      >
        <Wordmark />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{ fontSize: p.title.length > 40 ? 48 : 60, fontWeight: 900, lineHeight: 1.05 }}
          >
            {p.title.length > 70 ? `${p.title.slice(0, 68)}…` : p.title}
          </div>
          <div style={{ fontSize: 28, color: MUTED }}>{`by @${p.handle}`}</div>
          {p.remixedFrom ? (
            <div style={{ fontSize: 22, color: MUTED }}>
              {`Remixed from ${p.remixedFrom.length > 40 ? `${p.remixedFrom.slice(0, 38)}…` : p.remixedFrom}`}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 22 }}>
          <div
            style={{
              display: "flex",
              background: MAGENTA,
              color: INK,
              fontWeight: 800,
              borderRadius: 999,
              padding: "10px 22px",
            }}
          >
            Remix it
          </div>
          <div
            style={{
              display: "flex",
              border: `2px solid ${PANEL}`,
              color: MUTED,
              borderRadius: 999,
              padding: "8px 20px",
            }}
          >
            {p.license}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", padding: "40px 40px 40px 0" }}>
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page
          <img
            src={p.cover}
            alt=""
            width={600}
            height={550}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "left top",
              borderRadius: 28,
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              borderRadius: 28,
              background: `linear-gradient(135deg, ${MAGENTA}66, ${CYAN}55)`,
            }}
          />
        )}
      </div>
    </div>,
  );
}

export async function profileCard(p: {
  displayName: string;
  handle: string;
  templates: number;
  avatar: string | null;
}): Promise<ImageResponse> {
  return render(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: `radial-gradient(circle at 90% 10%, ${MAGENTA}44, transparent 45%), ${INK}`,
        color: "#fff",
        fontFamily: "Archivo",
      }}
    >
      <Wordmark />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {p.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page
          <img src={p.avatar} alt="" width={180} height={180} style={{ borderRadius: 999 }} />
        ) : (
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: MAGENTA,
              color: INK,
              fontSize: 80,
              fontWeight: 900,
            }}
          >
            {(p.displayName[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 68, fontWeight: 900 }}>
            {p.displayName.length > 28 ? `${p.displayName.slice(0, 26)}…` : p.displayName}
          </div>
          <div style={{ fontSize: 32, color: MUTED }}>{`@${p.handle}`}</div>
        </div>
      </div>
      <div style={{ fontSize: 28, color: MUTED }}>
        {p.templates === 0
          ? "Creator on REMAXX"
          : `${p.templates} ${p.templates === 1 ? "template" : "templates"} to remix on REMAXX`}
      </div>
    </div>,
  );
}
