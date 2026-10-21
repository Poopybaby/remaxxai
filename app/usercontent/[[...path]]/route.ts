import { siteConfig } from "@/config/site";
import { previewSecurityHeaders } from "@/lib/security/headers";
import { classifyHost } from "@/lib/security/hosts";

/**
 * Preview origin entry point. proxy.ts rewrites every request on the preview host here and
 * blocks this path on the app host. Phase 2 serves project files from storage; for now it
 * answers with a static page that confirms isolation is wired up.
 *
 * Nothing here ever executes uploaded code on the server: files are streamed back as bytes
 * and run only in the visitor's browser, inside a sandboxed iframe on this separate origin.
 */
export async function GET(request: Request): Promise<Response> {
  // Defense in depth: refuse if somehow reached on the app host.
  if (classifyHost(request.headers.get("host"), siteConfig.previewOrigin) !== "preview") {
    return new Response("Not found", { status: 404 });
  }

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>REMAXX preview origin</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f0d1e;color:#f4f2ff;font:16px/1.5 system-ui,sans-serif}p{max-width:36ch;text-align:center}</style>
</head>
<body><p>This origin serves project previews in a sandbox. Open a project on REMAXX to see one here.</p></body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...previewSecurityHeaders() },
  });
}
