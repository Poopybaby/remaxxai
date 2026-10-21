import { NextResponse, type NextRequest } from "next/server";
import { canViewProject } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getVersionFile } from "@/lib/projects/queries";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Source view for the file browser. Always returns text/plain (never HTML), so an uploaded file
 * can't render or run on the app origin. Permission-checked: unpublished projects are visible
 * only to their owner and admins.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/projects/[id]/file">,
) {
  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get("version") ?? "";
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!UUID.test(id) || !UUID.test(versionId) || !path || path.length > 200 || !isDbConfigured()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await getVersionFile(getDb(), versionId, path);
  if (!file || !canViewProject(await getViewer(), file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!/^(text\/|application\/(json|xml|manifest)|image\/svg)/.test(file.mime)) {
    return NextResponse.json({ error: "Binary file" }, { status: 415 });
  }
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
