/**
 * Builds the app with the smoke-test settings from playwright.config.ts (one source of truth).
 * NEXT_PUBLIC_* values are baked in at build time, so the e2e build can't reuse the normal one.
 */
import { spawnSync } from "node:child_process";
import { E2E_ENV } from "../../playwright.config";

const res = spawnSync("pnpm", ["build"], {
  stdio: "inherit",
  env: { ...process.env, ...E2E_ENV },
});
process.exit(res.status ?? 1);
