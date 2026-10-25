/**
 * Product analytics (PostHog), browser only. Off unless NEXT_PUBLIC_POSTHOG_KEY is set.
 *
 * Privacy defaults: nothing stored on the device (memory persistence, so no cookie banner is
 * needed), no person profiles, no session recordings or surveys, Do Not Track respected, and only
 * the events below plus page views. URLs are scrubbed (lib/monitoring/scrub.ts). Never put text
 * people typed (prompts, search, titles) or anything identifying in event properties.
 */
import { scrubAnalyticsProperties } from "./scrub";

export type AnalyticsEvent =
  | { name: "project_created"; props: { starter: string } }
  | { name: "remix_started"; props: Record<string, never> }
  | { name: "ai_prompt_sent"; props: { kind: "edit" | "explain"; model: string; images: number } }
  | { name: "ai_change_applied"; props: { files: number } }
  | { name: "published"; props: { remix: boolean; license: string; held: boolean } }
  | { name: "checkout_started"; props: { plan: string } };

type Client = { capture: (event: string, props?: Record<string, unknown>) => void };

declare global {
  interface Window {
    __remaxxAnalytics?: Client;
    __remaxxAnalyticsQueue?: [string, Record<string, unknown>][];
  }
}

/** Records an event. Safe to call anywhere in the browser; does nothing when analytics is off. */
export function track<E extends AnalyticsEvent>(name: E["name"], props: E["props"]): void {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    if (window.__remaxxAnalytics) window.__remaxxAnalytics.capture(name, props);
    // Events before the library finishes loading are sent once it does.
    else (window.__remaxxAnalyticsQueue ??= []).push([name, props]);
  } catch {
    // Analytics must never break the app.
  }
}

export async function startAnalytics(key: string, host: string): Promise<void> {
  const { default: posthog } = await import("posthog-js");
  posthog.init(key, {
    api_host: host,
    persistence: "memory",
    person_profiles: "never",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    respect_dnt: true,
    before_send: (event) => {
      if (!event) return null;
      event.properties = scrubAnalyticsProperties(event.properties ?? {});
      return event;
    },
  });
  window.__remaxxAnalytics = posthog;
  for (const [name, props] of window.__remaxxAnalyticsQueue?.splice(0) ?? []) {
    posthog.capture(name, props);
  }
}
