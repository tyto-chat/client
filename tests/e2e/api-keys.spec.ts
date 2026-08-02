/**
 * Personal access tokens — issue, one-time reveal, use, revoke.
 *
 * The interesting property is not the UI: it is that the issued token actually
 * authenticates against the API, and stops doing so once revoked. Both are
 * asserted with a direct request from the test, using only `Bearer pat_*`.
 *
 * A throwaway member owns the keys so no world fixture account is left holding
 * credentials.
 */

import { request } from "@playwright/test";
import { test, expect } from "./worldFixtures";
import { authedPage } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { testIds } from "./testIds";
import type { Page } from "@playwright/test";

let owner: { jwt: string; name: string; email: string };
let token = "";

const KEY_NAME = "E2E token";

async function openApiKeysTab(page: Page): Promise<void> {
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 6_000 });
  await page.getByTestId("pref-tab-apikeys").click();
}

/** GET /api/v1/me with a PAT — returns the HTTP status. */
async function meStatusWithToken(pat: string): Promise<number> {
  const api = await request.newContext({
    baseURL: E2E_API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${pat}`, Accept: "application/ld+json" },
    ignoreHTTPSErrors: true,
  });
  try {
    return (await api.get("/api/v1/me")).status();
  } finally {
    await api.dispose();
  }
}

test.describe.serial("API keys", () => {
  test.beforeAll(async ({ world }) => {
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      owner = await wb.createMember(world.communityId, "Api Key Owner");
    } finally {
      await wb.dispose();
    }
  });

  test("issuing a key shows the token once and lists the key", async ({ browser, world }) => {
    const page = await authedPage(browser, owner.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await openApiKeysTab(page);

      await expect(page.getByText("No API keys yet.")).toBeVisible({ timeout: 8_000 });
      await page.getByRole("button", { name: "Create new key" }).click();

      const dialog = page.getByRole("dialog").last();
      await dialog.getByPlaceholder("e.g. CI bot").fill(KEY_NAME);
      // By testid: filtering rows by text matched more than one wrapper, so the
      // key occasionally got a scope that does not cover /me.
      await dialog.getByTestId("api-key-scope-profile-read").check();
      // Read the token from the create response rather than the rendered <code>:
      // the displayed value wraps, and scraping it produced strings that were
      // not valid in an Authorization header.
      const [created] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes("/api-keys") && res.request().method() === "POST",
        ),
        dialog.getByRole("button", { name: "Create", exact: true }).click(),
      ]);
      token = ((await created.json()) as { plainToken: string }).plainToken;
      expect(token.startsWith("pat_")).toBe(true);

      await expect(page.getByText("Save this token now")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "I've saved it" }).click();
      await expect(page.getByText(KEY_NAME)).toBeVisible({ timeout: 8_000 });
    } finally {
      await page.context().close();
    }
  });

  test("the issued token authenticates against the API", async () => {
    // Polled rather than asserted once: the key is seconds old and a single
    // sampled status has nothing to retry against.
    await expect.poll(() => meStatusWithToken(token), { timeout: 10_000 }).toBe(200);
  });

  test("revoking the key stops the token working", async ({ browser, world }) => {
    const page = await authedPage(browser, owner.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await openApiKeysTab(page);

      await page.getByRole("button", { name: "Revoke", exact: true }).first().click();
      await page.getByTestId(testIds.confirmDialogConfirm).click();

      await expect(page.getByText("Revoked")).toBeVisible({ timeout: 8_000 });
    } finally {
      await page.context().close();
    }

    await expect.poll(() => meStatusWithToken(token), { timeout: 10_000 }).toBe(401);
  });
});
