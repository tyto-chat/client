import { request } from "@playwright/test";

const READY_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;

/**
 * Fail fast when the client container is not serving yet. Without this the
 * first specs to run race the dev server and hit nginx 502s, which Playwright
 * then hides behind a retry — the axe specs flaked this way for weeks.
 */
export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? "https://client.ddev.site";
  const context = await request.newContext({ ignoreHTTPSErrors: true });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = "no response";

  try {
    for (;;) {
      try {
        const response = await context.get(baseURL, { timeout: 5_000 });
        if (response.ok()) return;
        last = `HTTP ${response.status()}`;
      } catch (error) {
        last = error instanceof Error ? error.message : String(error);
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `client not serving ${baseURL} after ${READY_TIMEOUT_MS}ms (last: ${last})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    await context.dispose();
  }
}
