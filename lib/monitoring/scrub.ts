/**
 * Privacy scrubbing for error reports (Sentry) and analytics (PostHog). Pure, so it runs in the
 * browser and on the server, and is unit tested.
 *
 * URLs keep only query parameters on an allowlist (explore filters, checkout result). Everything
 * else is dropped: sign-in codes and tokens, Stripe session IDs, and search text, which people
 * sometimes type personal details into.
 */

const KEEP_PARAMS = new Set(["sort", "category", "tool", "style", "license", "checkout", "page"]);

export function scrubUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw, "https://placeholder.invalid");
  } catch {
    return raw.split(/[?#]/)[0] ?? "";
  }
  const kept = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (KEEP_PARAMS.has(k)) kept.set(k, v.slice(0, 60));
    else kept.set(k, "[removed]");
  }
  const query = kept.toString();
  const base = raw.startsWith("/") ? url.pathname : `${url.origin}${url.pathname}`;
  // The fragment can carry tokens too (some auth flows); drop it.
  return query ? `${base}?${query.replace(/%5Bremoved%5D/g, "[removed]")}` : base;
}

const SECRET_HEADERS = /^(cookie|authorization|stripe-signature|x-api-key|set-cookie)$/i;

type SentryLikeEvent = {
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    data?: unknown;
  };
  user?: Record<string, unknown>;
  breadcrumbs?: { data?: Record<string, unknown> }[];
};

/** Sentry `beforeSend`: no cookies, auth headers, request bodies, IPs or emails; scrubbed URLs. */
export function scrubSentryEvent<T extends SentryLikeEvent>(event: T): T {
  if (event.request) {
    const r = event.request;
    if (r.url) r.url = scrubUrl(r.url);
    delete r.query_string;
    delete r.cookies;
    // Request bodies can hold prompts, profile text or uploads.
    delete r.data;
    if (r.headers) {
      for (const k of Object.keys(r.headers)) if (SECRET_HEADERS.test(k)) delete r.headers[k];
    }
  }
  if (event.user) {
    // Keep the internal user id only (useful to group errors), never email or IP.
    event.user = typeof event.user.id === "string" ? { id: event.user.id } : {};
  }
  for (const b of event.breadcrumbs ?? []) {
    if (!b.data) continue;
    for (const key of ["url", "from", "to"] as const) {
      const v = b.data[key];
      if (typeof v === "string") b.data[key] = scrubUrl(v);
    }
  }
  return event;
}

/** PostHog `before_send`: scrubbed URLs, nothing that identifies the person. */
export function scrubAnalyticsProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (/^\$(ip|set|set_once)$/.test(k)) continue;
    if (typeof v === "string" && /(url|href|referrer|pathname)$/i.test(k)) out[k] = scrubUrl(v);
    else out[k] = v;
  }
  return out;
}

/**
 * Sentry's `dataCollection` (v11). Its defaults collect cookies, bodies, AI prompts and outputs,
 * database values and stack-frame variables (which could include API keys), so everything is
 * off; `beforeSend` above is the second layer.
 */
export function sentryDataCollection() {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: ["user-agent", "accept-language"] }, response: false },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  };
}
