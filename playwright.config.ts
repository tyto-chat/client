import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local so E2E_* variables are available when running inside ddev
try {
  const envLocal = readFileSync(resolve(import.meta.dirname, ".env.local"), "utf-8");
  for (const line of envLocal.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && !(key in process.env)) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
} catch {
  // .env.local is optional
}

/**
 * E2E tests run against the live ddev stack:
 *   frontend → https://client.ddev.site   (E2E_BASE_URL in .env.local)
 *   backend  → https://core-test.ddev.site (E2E_API_URL in .env.local)
 *
 * The database is reset before each run by `ddev e2e [group]` (runs ddev reset-test-db in core).
 *
 * ## Running tests
 *
 *   ddev e2e                  Full suite (all spec files, chromium project)
 *   ddev e2e <group>          Scoped run — only that group's tests
 *
 * Available groups: auth, anonymous, profile, locale, messaging, realtime,
 *                   channels, moderation, community, groups, roles, notifications,
 *                   navigation, conversation, pagination
 *
 * ## How world seeding works
 *
 * Each Playwright worker seeds its own isolated world (community + users) on
 * first use via the `world` worker-scoped fixture in worldFixtures.ts. There are
 * no global setup projects; the database is reset once before the run by
 * `ddev e2e`, then each worker self-seeds on demand.
 *
 * ## Debugging a specific test
 *
 *   ddev npm run test:e2e -- --project=moderation --grep "admin warns"
 */
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./playwright-results",
  // Per-worker isolated worlds (see tests/e2e/worldFixtures.ts) let files run
  // in parallel: each worker seeds its own community + users, so different
  // files never share mutable server state. Tests within a describe.serial
  // block still run in order on a single worker.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // retries:1. A genuine bug fails both attempts; a rare SSE/timing transient
  // passes on retry. (The suite is not resource-bound — do not paper over
  // failures by raising this; root-cause them.)
  retries: process.env.CI ? 2 : 1,
  // 4 oversubscribes and is both flakier and slower: 228/289 in 20.0m vs 289/289 in 11.9m.
  workers: 2,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  // CI runners are ~2x slower than local ddev; scaled budgets keep transient
  // slowness from masquerading as failures.
  timeout: process.env.CI ? 40_000 : 20_000, // per-test timeout
  expect: {
    timeout: process.env.CI ? 15_000 : 8_000, // per-assertion timeout; raised slightly for SSE tests
  },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://client.ddev.site",
    ignoreHTTPSErrors: true, // ddev self-signed certs inside the container
    actionTimeout: process.env.CI ? 15_000 : 8_000, // per-action timeout (click, fill, hover, etc.)
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // ── Full suite ───────────────────────────────────────────────────────────
    // Default project — runs all spec files. Always invoked via `ddev e2e`.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // ── Scoped groups — `ddev e2e <group>` or --project=<group> ─────────────
    {
      name: "auth",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/auth\.spec\.ts$/,
    },
    {
      name: "anonymous",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/anonymous-browsing\.spec\.ts$/,
    },
    {
      name: "profile",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/profile\.spec\.ts$/,
    },
    {
      name: "locale",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/locale\.spec\.ts$/,
    },
    {
      name: "messaging",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        /\/(messaging|message-history|message-permissions|mentions|reactions|attachments|emoji-autocomplete)\.spec\.ts$/,
    },
    {
      name: "realtime",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/realtime\.spec\.ts$/,
    },
    {
      name: "channels",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/(channels-admin|channel-access|channel-members)\.spec\.ts$/,
    },
    {
      name: "moderation",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/(moderation|moderators)\.spec\.ts$/,
    },
    {
      name: "community",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/(community-admin|community-emojis)\.spec\.ts$/,
    },
    {
      name: "groups",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/groups(-owner)?\.spec\.ts$/,
    },
    {
      name: "roles",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/role-visibility\.spec\.ts$/,
    },
    {
      name: "notifications",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/notifications\.spec\.ts$/,
    },
    {
      name: "navigation",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/navigation\.spec\.ts$/,
    },
    {
      name: "admin",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/admin\.spec\.ts$/,
    },
    {
      name: "conversation",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/conversation\.spec\.ts$/,
    },
    {
      name: "themeonboarding",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/theme-onboarding\.spec\.ts$/,
    },
    {
      name: "welcome",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/welcome-messages\.spec\.ts$/,
    },
    {
      name: "reorder",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/reorder\.spec\.ts$/,
    },
    {
      name: "appeals",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/appeals\.spec\.ts$/,
    },
    {
      name: "gdpr",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/gdpr\.spec\.ts$/,
    },
    {
      name: "apikeys",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/api-keys\.spec\.ts$/,
    },
    {
      name: "adminwebhooks",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/admin-webhooks\.spec\.ts$/,
    },
    {
      name: "adminsettings",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/admin-settings\.spec\.ts$/,
    },
    {
      name: "invites",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/invites\.spec\.ts$/,
    },
    {
      name: "twofactor",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/two-factor\.spec\.ts$/,
    },
    {
      name: "pagination",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/message-pagination\.spec\.ts$/,
    },
    {
      name: "a11y",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\/accessibility\.spec\.ts$/,
    },
  ],
});
