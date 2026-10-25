import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { canOpenInEditor } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { blobs, projectFiles, projects, projectVersions } from "@/lib/db/schema";
import { jsonError, UUID } from "@/lib/editor/http";

/**
 * A draft's image, font or media file, by hash, for the editor's live preview. Owner only.
 * Always served as an opaque download (never rendered on the app origin); the editor turns it
 * into a data: URL that only runs inside the sandboxed preview.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/editor/[id]/asset">,
) {
  const { id } = await params;
  const sha = request.nextUrl.searchParams.get("sha") ?? "";
  if (!UUID.test(id) || !/^[a-f0-9]{64}$/.test(sha) || !isDbConfigured())
    return jsonError(404, "Not found");
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project || !canOpenInEditor(await getViewer(), project)) return jsonError(404, "Not found");

  const [row] = await db
    .select({ content: blobs.content })
    .from(projectFiles)
    .innerJoin(projectVersions, eq(projectVersions.id, projectFiles.versionId))
    .innerJoin(blobs, eq(blobs.sha256, projectFiles.blobSha256))
    .where(and(eq(projectVersions.projectId, id), eq(projectFiles.blobSha256, sha)))
    .limit(1);
  if (!row?.content) return jsonError(404, "Not found");
  return new Response(new Uint8Array(row.content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
