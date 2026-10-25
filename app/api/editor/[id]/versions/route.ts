import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { handleRouteError, jsonError, jsonOk, UUID } from "@/lib/editor/http";
import { listVersions } from "@/lib/projects/versions";

export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/api/editor/[id]/versions">,
) {
  const { id } = await params;
  if (!UUID.test(id) || !isDbConfigured()) return jsonError(404, "Not found");
  try {
    return jsonOk({ versions: await listVersions(getDb(), await getViewer(), id) });
  } catch (err) {
    return handleRouteError(err, "editor.versions");
  }
}
