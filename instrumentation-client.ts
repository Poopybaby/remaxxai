/**
 * Browser monitoring: Sentry errors and PostHog analytics, each only when its key is set.
 * Both SDKs load after the page is interactive (dynamic import), so they don't slow first load.
 */
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

function later(fn: () => void) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
}

if (sentryDsn) {
  later(() => {
    Promise.all([import("@sentry/nextjs"), import("@/lib/monitoring/scrub")])
      .then(([Sentry, { scrubSentryEvent, sentryDataCollection }]) => {
        Sentry.init({
          dsn: sentryDsn,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
          dataCollection: sentryDataCollection(),
          tracesSampleRate: 0,
          // No session replays: they would record what people type.
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          beforeSend: (event) => scrubSentryEvent(event),
        });
      })
      .catch(() => {
        // Monitoring must never break the app.
      });
  });
}

if (posthogKey) {
  later(() => {
    import("@/lib/monitoring/analytics")
      .then(({ startAnalytics }) => startAnalytics(posthogKey, posthogHost))
      .catch(() => {});
  });
}
