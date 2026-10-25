/**
 * Server-side error monitoring (Sentry). Off unless NEXT_PUBLIC_SENTRY_DSN is set; the SDK is
 * only loaded when it is. Reports are scrubbed of cookies, auth headers, request bodies, emails
 * and IPs before they leave (lib/monitoring/scrub.ts).
 */
import type { Instrumentation } from "next";

const dsn = () => process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

export async function register() {
  const key = dsn();
  if (!key) return;
  const [Sentry, { scrubSentryEvent, sentryDataCollection }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/monitoring/scrub"),
  ]);
  Sentry.init({
    dsn: key,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    dataCollection: sentryDataCollection(),
    // Errors only for now; performance tracing can be turned on later with a sample rate.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubSentryEvent(event),
  });
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!dsn()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
