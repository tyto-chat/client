import { test as base, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

export const E2E_API_URL = process.env.E2E_API_URL ?? "https://core-test.ddev.site";
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "https://client.ddev.site";

/**
 * Applies the server-info route intercept to a page or context so the app
 * uses the test backend (E2E_API_URL) instead of what's baked into the Vite
 * dev server. Pass a `BrowserContext` to cover all pages in that context.
 */
export async function setupServerInfoRoute(target: Page | BrowserContext) {
  await target.route("**/api/v1/server-info", (route) => {
    const original = new URL(route.request().url());
    route.continue({ url: `${E2E_API_URL}${original.pathname}${original.search}` });
  });
}

/**
 * Registers console/pageerror/5xx-response listeners on a page immediately and
 * returns a `flush` function. Call `flush()` after `use(page)`: on test failure
 * it attaches the collected console logs + server errors to the report so they
 * appear alongside the screenshot. Single source of truth for the diagnostics
 * wiring shared by the base `page` fixture and the role-page fixtures.
 */
export function attachPageDiagnostics(page: Page, testInfo: TestInfo): () => Promise<void> {
  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    consoleLogs.push(`[pageerror] ${err.message}`);
  });

  const serverErrors: string[] = [];
  page.on("response", async (response) => {
    if (response.status() >= 500) {
      try {
        const body = await response.text();
        serverErrors.push(
          `${response.status()} ${response.request().method()} ${response.url()}\n${body}`,
        );
      } catch {
        serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    }
  });

  return async () => {
    if (testInfo.status !== testInfo.expectedStatus) {
      if (consoleLogs.length > 0) {
        await testInfo.attach("console logs", {
          body: consoleLogs.join("\n"),
          contentType: "text/plain",
        });
      }
      if (serverErrors.length > 0) {
        await testInfo.attach("server errors (5xx)", {
          body: serverErrors.join("\n\n---\n\n"),
          contentType: "text/plain",
        });
      }
    }
  };
}

/**
 * Extends the base Playwright `test` with a `page` fixture that intercepts
 * the server-info endpoint and rewrites `apiUrl` to point at the test backend.
 * This ensures the app talks to core-test.ddev.site regardless of what
 * VITE_SERVER_INFO_URL is baked into the running Vite dev server.
 *
 * Console messages are collected during the test and attached to the report
 * on failure so errors are visible alongside the screenshot.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await setupServerInfoRoute(page);
    const flush = attachPageDiagnostics(page, testInfo);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    await flush();
  },
});

export { expect } from "@playwright/test";
