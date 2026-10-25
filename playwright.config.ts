import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests (e2e/). They run the built app against a local Postgres prepared by
 * `pnpm e2e:db`, with local stand-ins for OpenAI and Supabase sign-in, so no real keys are used.
 * The app must be built with the same E2E_* settings (see the e2e job in .github/workflows/ci.yml).
 */
export const E2E_ENV = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_PREVIEW_ORIGIN: "http://127.0.0.1:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:5700",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
  OPENAI_API_KEY: "sk-e2e-not-a-real-key",
  OPENAI_BASE_URL: "http://127.0.0.1:5600/v1",
  AI_ACCESS: "admins",
  STRIPE_SECRET_KEY: "sk_test_e2eNotARealKey",
  STRIPE_WEBHOOK_SECRET: "whsec_e2eNotARealSecret",
} as const;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

export default defineConfig({
  testDir: "e2e",
  // The tests share one database and build on each other's data.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: E2E_ENV.NEXT_PUBLIC_APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/support/fake-openai.mjs",
      url: "http://127.0.0.1:5600/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node e2e/support/fake-auth.mjs",
      url: "http://127.0.0.1:5700/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm start -p 3000",
      url: "http://localhost:3000/api/health",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { ...E2E_ENV, DATABASE_URL },
    },
  ],
});
