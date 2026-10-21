import { getDb, isDbConfigured } from "@/lib/db/client";
import { getImageBlob } from "@/lib/projects/queries";
import { detectCoverType } from "@/lib/upload/mime";

/**
 * Serves uploaded cover images by content hash: /media/<sha256>.<ext>.
 * Only raster images are ever returned, and only when the bytes match the requested type,
 * so this route can't be used to serve HTML or SVG from the app origin.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[file]">) {
  const { file } = await params;
  const match = /^([a-f0-9]{64})\.(png|jpg|webp|gif)$/.exec(file);
  if (!match || !isDbConfigured()) return new Response("Not found", { status: 404 });

  const bytes = await getImageBlob(getDb(), match[1]!);
  const type = bytes ? detectCoverType(bytes) : null;
  if (!bytes || !type || type.ext !== match[2]) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
