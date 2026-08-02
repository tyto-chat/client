/**
 * worldFixtures — per-worker isolated world + per-role authenticated pages.
 *
 * Extends the base `test` (from ./fixtures, which wires the server-info route +
 * console/5xx capture onto the default `page`) with:
 *
 *   - `world`  (WORKER-scoped): one seeded world per Playwright worker, built by
 *     seedWorld(`w${workerInfo.parallelIndex}`). Reused across all tests the
 *     worker runs, so creation cost is paid once per worker.
 *   - `adminPage` / `userPage` / `cadminPage` (TEST-scoped): a fresh
 *     authenticated browser context+page for the matching role JWT. The context
 *     is created per test and torn down after, so role sessions never bleed
 *     between tests.
 *
 * ## Cleanup convention
 *
 * `adminPage` is the SHARED bootstrap global admin (the same account across all
 * workers). Never mutate its own account state — display name, avatar, password,
 * locale, theme, push subscriptions. Use `userPage` or `cadminPage` for any
 * test that exercises account-state changes.
 *
 * Per-worker isolation prevents cross-WORKER leaks, but every spec a worker
 * runs SHARES that worker's `world` (same community + users). If a test leaves
 * durable per-world state that a later SAME-WORKER spec depends on being clean
 * (e.g. group ownership → `ownsAnyGroup`), revert it in an `afterAll` block.
 * The worker-scoped `world` fixture IS available in `afterAll`, so you can call
 * WorldBuilder API methods directly. See `groups-owner.spec.ts` for the pattern.
 */
import { type Browser, type Page } from "@playwright/test";
import { test as base, setupServerInfoRoute, attachPageDiagnostics } from "./fixtures";
import { seedWorld } from "./world/seedWorld";
import type { World } from "./world/types";

/**
 * Spin up a fresh authenticated context + page for a given JWT. Mirrors the
 * default `page` fixture's server-info intercept and seeds the JWT into the
 * app's in-memory token store (via the DEV-only `__TYTO_DEV_TOKEN__` global
 * the store reads at boot) before any app script runs. Caller owns teardown:
 * close `page.context()` when done.
 *
 * Exported so later specs can build extra concurrent sessions (e.g. two users
 * in the same realtime test) beyond the three role fixtures below.
 */
export async function authedPage(browser: Browser, jwt: string): Promise<Page> {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await setupServerInfoRoute(ctx);
  await ctx.addInitScript((token) => {
    (window as unknown as { __TYTO_DEV_TOKEN__?: string }).__TYTO_DEV_TOKEN__ = token;
  }, jwt);
  return ctx.newPage();
}

interface WorldFixtures {
  world: World;
}

interface RolePageFixtures {
  adminPage: Page;
  userPage: Page;
  cadminPage: Page;
}

export const test = base.extend<RolePageFixtures, WorldFixtures>({
  world: [
    async ({}, use, workerInfo) => {
      const world = await seedWorld(`w${workerInfo.parallelIndex}`);
      await use(world);
    },
    { scope: "worker" },
  ],

  adminPage: async ({ browser, world }, use, testInfo) => {
    const page = await authedPage(browser, world.adminJwt);
    const flush = attachPageDiagnostics(page, testInfo);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    await flush();
    await page.context().close();
  },

  userPage: async ({ browser, world }, use, testInfo) => {
    const page = await authedPage(browser, world.userJwt);
    const flush = attachPageDiagnostics(page, testInfo);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    await flush();
    await page.context().close();
  },

  cadminPage: async ({ browser, world }, use, testInfo) => {
    const page = await authedPage(browser, world.cadminJwt);
    const flush = attachPageDiagnostics(page, testInfo);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    await flush();
    await page.context().close();
  },
});

export { expect } from "./fixtures";
