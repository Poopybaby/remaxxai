/** Response headers for the main app origin. The preview origin sets its own, stricter set. */
export function appSecurityHeaders(isHttps: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    // The app is never framed; only the preview origin is.
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Microphone is allowed for our own origin (voice prompts in the editor), nothing else.
    "Permissions-Policy": "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (isHttps)
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  return headers;
}

/**
 * Headers for anything served from the preview origin. `sandbox` in the CSP applies even if
 * someone opens a preview URL directly instead of through our iframe. Only the app may frame it.
 */
export function previewSecurityHeaders(appOrigin: string): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
      "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'",
      "form-action 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      `frame-ancestors ${appOrigin}`,
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    // Sandboxed documents have an opaque origin, so module scripts and fonts load as CORS requests.
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    // Short so takedowns stop serving quickly.
    "Cache-Control": "public, max-age=300",
  };
}
