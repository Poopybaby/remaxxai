import { NextResponse, type NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { appSecurityHeaders } from "@/lib/security/headers";
import { classifyHost, PREVIEW_ROUTE_PREFIX, requiresSignIn } from "@/lib/security/hosts";
import { refreshSession } from "@/lib/supabase/proxy-session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = classifyHost(request.headers.get("host"), siteConfig.previewOrigin);

  // Preview origin: serves untrusted project files only. No sessions, no app pages.
  if (host === "preview") {
    const url = request.nextUrl.clone();
    url.pathname = `${PREVIEW_ROUTE_PREFIX}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // App origin: the preview route must never be reachable here.
  if (pathname === PREVIEW_ROUTE_PREFIX || pathname.startsWith(`${PREVIEW_ROUTE_PREFIX}/`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Static files from public/ don't need a session refresh.
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return NextResponse.next();

  const { response, userId } = await refreshSession(request);

  if (!userId && requiresSignIn(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }

  const isHttps = request.nextUrl.protocol === "https:";
  for (const [key, value] of Object.entries(appSecurityHeaders(isHttps))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js build assets. Files with extensions still pass through so the
    // preview origin can serve a project's images, scripts and styles.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
