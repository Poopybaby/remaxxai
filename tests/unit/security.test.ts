import { describe, expect, it } from "vitest";
import { appSecurityHeaders, previewSecurityHeaders } from "@/lib/security/headers";
import { classifyHost, requiresSignIn, safeNextPath } from "@/lib/security/hosts";

describe("classifyHost", () => {
  const preview = "https://remaxxusercontent.com";

  it("routes the preview domain to the preview origin", () => {
    expect(classifyHost("remaxxusercontent.com", preview)).toBe("preview");
    expect(classifyHost("REMAXXUSERCONTENT.com", preview)).toBe("preview");
  });

  it("treats everything else as the app", () => {
    expect(classifyHost("remaxx.ai", preview)).toBe("app");
    expect(classifyHost("evil.remaxxusercontent.com", preview)).toBe("app");
    expect(classifyHost(null, preview)).toBe("app");
  });

  it("distinguishes local dev hosts by host and port", () => {
    expect(classifyHost("127.0.0.1:3000", "http://127.0.0.1:3000")).toBe("preview");
    expect(classifyHost("localhost:3000", "http://127.0.0.1:3000")).toBe("app");
  });
});

describe("safeNextPath", () => {
  it("allows same-site relative paths", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/u/juno?tab=remixes")).toBe("/u/juno?tab=remixes");
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])("blocks %s", (value) => {
    expect(safeNextPath(value, "/fallback")).toBe("/fallback");
  });
});

describe("requiresSignIn", () => {
  it("covers onboarding, settings and admin, including subpaths", () => {
    expect(requiresSignIn("/settings")).toBe(true);
    expect(requiresSignIn("/settings/profile")).toBe(true);
    expect(requiresSignIn("/admin/reports")).toBe(true);
    expect(requiresSignIn("/onboarding")).toBe(true);
  });

  it("leaves public pages alone", () => {
    expect(requiresSignIn("/")).toBe(false);
    expect(requiresSignIn("/u/juno")).toBe(false);
    expect(requiresSignIn("/settingsx")).toBe(false);
  });
});

describe("security headers", () => {
  it("never lets the app be framed", () => {
    const h = appSecurityHeaders(false);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Strict-Transport-Security"]).toBeUndefined();
    expect(appSecurityHeaders(true)["Strict-Transport-Security"]).toBeDefined();
  });

  it("sandboxes previews without same-origin or forms", () => {
    const csp = previewSecurityHeaders("https://remaxx.ai")["Content-Security-Policy"];
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("allow-forms");
    expect(csp).not.toContain("allow-top-navigation");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors https://remaxx.ai");
  });
});
