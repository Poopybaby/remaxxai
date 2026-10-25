import { describe, expect, it } from "vitest";
import {
  scrubAnalyticsProperties,
  scrubSentryEvent,
  scrubUrl,
  sentryDataCollection,
} from "@/lib/monitoring/scrub";

describe("scrubUrl", () => {
  it("keeps paths and explore filters, removes everything else", () => {
    expect(scrubUrl("https://remaxx.ai/explore?sort=trending&style=dark")).toBe(
      "https://remaxx.ai/explore?sort=trending&style=dark",
    );
    expect(scrubUrl("https://remaxx.ai/auth/confirm?token_hash=abc123&type=email")).toBe(
      "https://remaxx.ai/auth/confirm?token_hash=[removed]&type=[removed]",
    );
    expect(scrubUrl("/explore?q=my+name+is+jane&sort=new")).toBe("/explore?q=[removed]&sort=new");
    expect(scrubUrl("https://remaxx.ai/login#access_token=xyz")).toBe("https://remaxx.ai/login");
    expect(scrubUrl("/p/moonbrew")).toBe("/p/moonbrew");
  });
});

describe("scrubSentryEvent", () => {
  it("drops cookies, auth headers, bodies and personal details", () => {
    const e = scrubSentryEvent({
      request: {
        url: "https://remaxx.ai/auth/callback?code=secret",
        query_string: "code=secret",
        cookies: { "sb-x-auth-token": "t" },
        headers: { Cookie: "a=b", Authorization: "Bearer t", "User-Agent": "x" },
        data: { prompt: "my private idea" },
      },
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
      breadcrumbs: [{ data: { url: "/billing?session_id=cs_123" } }, {}],
    });
    expect(e.request).toEqual({
      url: "https://remaxx.ai/auth/callback?code=[removed]",
      headers: { "User-Agent": "x" },
    });
    expect(e.user).toEqual({ id: "u1" });
    expect(e.breadcrumbs?.[0]?.data?.url).toBe("/billing?session_id=[removed]");
  });
});

describe("scrubAnalyticsProperties", () => {
  it("scrubs URLs and drops IP and person properties", () => {
    expect(
      scrubAnalyticsProperties({
        $current_url: "https://remaxx.ai/explore?q=secret",
        $referrer: "https://remaxx.ai/login?next=/x",
        $ip: "1.2.3.4",
        $set: { email: "a@b.com" },
        model: "gpt-mini",
      }),
    ).toEqual({
      $current_url: "https://remaxx.ai/explore?q=[removed]",
      $referrer: "https://remaxx.ai/login?next=[removed]",
      model: "gpt-mini",
    });
  });
});

describe("sentryDataCollection", () => {
  it("turns off everything that could carry personal data or secrets", () => {
    expect(sentryDataCollection()).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });
});
