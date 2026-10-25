import { siteConfig } from "@/config/site";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { getVersionFile } from "@/lib/projects/queries";
import { previewSecurityHeaders } from "@/lib/security/headers";
import { classifyHost } from "@/lib/security/hosts";

/**
 * Preview origin. proxy.ts rewrites every request on the preview host here (and blocks this path
 * on the app host). URLs look like:  <preview origin>/v/<versionId>/<file path>
 *
 * Files are returned as bytes and only ever run in the visitor's browser, inside a sandboxed
 * iframe on this separate origin. Nothing uploaded is executed on the server.
 * Only published projects are served: this origin has no cookies, so it can't know who's asking.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(request: Request, { params }: RouteContext<"/usercontent/[[...path]]">) {
  if (classifyHost(request.headers.get("host"), siteConfig.previewOrigin) !== "preview") {
    return new Response("Not found", { status: 404 });
  }
  const headers = previewSecurityHeaders(new URL(siteConfig.appUrl).origin);
  const { path = [] } = await params;

  if (path.length === 0) {
    return new Response(LANDING_HTML, {
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // The editor's live preview: a blank page that renders whatever the app posts to it.
  if (path.length === 1 && path[0] === "run") {
    return new Response(runnerHtml(new URL(siteConfig.appUrl).origin), {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const [kind, versionId, ...rest] = path;
  if (kind !== "v" || !versionId || !UUID.test(versionId) || !isDbConfigured())
    return notFound(headers);

  let filePath = rest.map((p) => decodeURIComponent(p)).join("/");
  if (filePath === "" || filePath.endsWith("/")) filePath += "index.html";
  if (filePath.split("/").some((p) => p === ".." || p === "")) return notFound(headers);

  const db = getDb();
  let file = await getVersionFile(db, versionId, filePath);
  // Extensionless links like /about → about.html or about/index.html, as static hosts do.
  if (!file && !/\.[a-z0-9]+$/i.test(filePath)) {
    file =
      (await getVersionFile(db, versionId, `${filePath}.html`)) ??
      (await getVersionFile(db, versionId, `${filePath}/index.html`));
  }
  if (!file || file.status !== "published") return notFound(headers);

  return new Response(new Uint8Array(file.bytes), {
    headers: { ...headers, "Content-Type": file.mime },
  });
}

function notFound(headers: Record<string, string>) {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const page = (body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>REMAXX preview</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f0d1e;color:#a9a4c9;font:15px/1.5 system-ui,sans-serif}p{max-width:36ch;text-align:center;padding:1rem}</style>
</head><body><p>${body}</p></body></html>`;

const LANDING_HTML = page(
  "This origin serves project previews in a sandbox. Open a project on REMAXX to see one here.",
);
const NOT_FOUND_HTML = page("This file isn't part of the project, or the project isn't public.");

/**
 * Accepts one document from the editor (only from the app's origin) and replaces itself with it.
 * Runs under the same sandbox CSP as every other preview, so the document gets an opaque origin:
 * no cookies, no storage, no access to the app.
 */
function runnerHtml(appOrigin: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body><script>
(function(){
  var APP = ${JSON.stringify(appOrigin)};
  window.addEventListener("message", function (e) {
    if (e.origin !== APP || !e.data || e.data.type !== "remaxx:render" || typeof e.data.html !== "string") return;
    document.open();
    document.write(e.data.html);
    document.close();
  });
  parent.postMessage({ type: "remaxx:ready" }, APP);
})();
</script></body></html>`;
}
