/**
 * Smoke tests: the main paths through REMAXX in a real browser against a real Postgres.
 * Run locally: start Postgres, `pnpm e2e:db`, build with the E2E settings, then `pnpm e2e`.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { sessionCookie } from "./support/users";

// A valid 1×1 PNG, used as a cover image.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function signedIn(browser: Browser, who: "admin" | "member"): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addCookies([sessionCookie(who, E2E_ENV.NEXT_PUBLIC_SUPABASE_URL)]);
  return ctx.newPage();
}

/** Fails the test on uncaught errors in the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test("health check sees the database and settings", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as Record<string, string>;
  expect(body.database).toMatch(/^ok: \d+ published templates/);
  expect(body.supabaseSignIn).toBe("ok");
  expect(body.payments).toBe("ok: test mode");
});

for (const path of [
  "/",
  "/explore",
  "/p/moonbrew",
  "/u/remaxx_studio",
  "/pricing",
  "/login",
  "/signup",
  "/legal/terms",
]) {
  test(`public page ${path} loads cleanly and is accessible`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res?.ok()).toBe(true);
    await expect(page.locator("main, article, section").first()).toBeVisible();
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });
}

test("vibe search finds templates", async ({ page }) => {
  await page.goto("/explore?q=coffee", { waitUntil: "networkidle" });
  await expect(page.getByText(/Moonbrew/).first()).toBeVisible();
});

test("an admin can create, edit with AI and publish a project", async ({ browser }) => {
  const page = await signedIn(browser, "admin");
  const errors = watchErrors(page);

  // Describe a project on Create (blank canvas). Sending makes the draft and opens the editor,
  // which sends the prompt by itself; the local stand-in answers it.
  await page.goto("/create", { waitUntil: "networkidle" });
  await expectAccessible(page);
  await page.getByRole("radio", { name: /Blank canvas/ }).click();
  await page.locator("#prompt").fill("Add a small glowing badge that says Remixed with REMAXX");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/edit\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByText("Review the changes")).toBeVisible({ timeout: 30_000 });
  await expectAccessible(page);
  await page.getByRole("button", { name: /^Apply/ }).click();
  await expect(page.getByText(/Applied to 1 file/)).toBeVisible({ timeout: 15_000 });

  // Publish with a cover.
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForURL(/\/publish$/);
  await expectAccessible(page);
  const title = `Smoke test ${Date.now().toString(36)}`;
  await page.locator("#title").fill(title);
  // The editor stays mounted (hidden) for instant back navigation, so pick the cover's own input.
  await page.locator('label:has-text("cover") input[type="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await page.locator("#rightsConfirmed").check();
  await page.getByRole("button", { name: "Publish project" }).click();
  await page.waitForURL(/\/p\/smoke-test-/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an admin sees the dashboard, users and billing", async ({ browser }) => {
  const page = await signedIn(browser, "admin");
  for (const path of ["/admin", "/admin/users?q=e2e", "/billing", "/notifications"]) {
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res?.ok(), path).toBe(true);
    await expectAccessible(page);
  }
  await page.goto("/admin");
  await expect(page.getByText("Last webhook from Stripe")).toBeVisible();
  await page.goto("/admin/users?q=e2e_member");
  await expect(page.getByText("@e2e_member")).toBeVisible();
});

test("members can't buy plans while AI is admins-only, or open admin pages", async ({
  browser,
}) => {
  const page = await signedIn(browser, "member");
  await page.goto("/pricing", { waitUntil: "networkidle" });
  await expect(page.getByText(/plans aren't on sale yet/)).toBeVisible();
  const status = await page.evaluate(async () => {
    const r = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });
    return r.status;
  });
  expect(status).toBe(403);
  // Admin pages stream, so the status is already 200 when the check runs; what matters is that
  // the member gets the not-found screen and none of the dashboard's data.
  for (const path of ["/admin", "/admin/users"]) {
    const res = await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
    const html = (await res?.text()) ?? "";
    for (const secret of [
      "Last webhook",
      "Monthly revenue",
      "e2e-admin@example.com",
      "Free prompts",
    ]) {
      expect(html, `${path} leaks "${secret}"`).not.toContain(secret);
    }
  }
});

test("anyone can upload a profile picture and switch back to one of the crew", async ({
  browser,
}) => {
  const page = await signedIn(browser, "member");
  const errors = watchErrors(page);
  await page.goto("/settings", { waitUntil: "networkidle" });
  const upload = page.waitForResponse((r) => r.url().includes("/api/profile/avatar"));
  await page.locator('label:has-text("Upload your own") input[type="file"]').setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  expect((await upload).status()).toBe(200);
  await expect(page.getByText("Your own picture")).toBeVisible();
  await page.getByRole("button", { name: "Plume" }).click();
  await expect(page.getByText(/An owl with an eye for detail/)).toBeVisible();
  // The public profile shows the new picture straight away.
  await page.goto("/u/e2e_member", { waitUntil: "networkidle" });
  await expect(page.locator('img[src*="plume"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});
