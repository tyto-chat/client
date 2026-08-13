/**
 * Theme preference and the first-run welcome wizard.
 *
 * Theme is a server-backed preference (the app migrates any local value to the
 * server on first load and the server then wins), so "persists" means it
 * survives a reload, not just a re-render.
 *
 * The wizard only appears for an account that has never completed onboarding —
 * every world fixture account has, so this spec registers its own raw user and
 * deliberately skips `completeOnboarding()`.
 */

import { test, expect } from "./worldFixtures";
import { authedPage } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { testIds } from "./testIds";

let rookieJwt = "";

test.describe.serial("Theme preference", () => {
  test("switching to Dark persists across a reload", async ({ userPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await page.getByTestId(testIds.profileMenuButton).click();
    await page.getByRole("button", { name: "Preferences" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(8_000) });

    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: T(8_000) });

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: T(10_000) });

    // Restore: the fixture account is shared with later specs on this worker.
    await page.getByTestId(testIds.profileMenuButton).click();
    await page.getByRole("button", { name: "Preferences" }).click();
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/, { timeout: T(8_000) });
  });
});

test.describe.serial("Welcome wizard", () => {
  test.beforeAll(async () => {
    const stamp = String(Date.now()).slice(-8);
    const email = `rookie-${stamp}@tyto.test`;
    const anon = new WorldBuilder(E2E_API_URL, E2E_BASE_URL);
    await anon.init();
    try {
      // No completeOnboarding() — that is the whole point of this account.
      await anon.registerUser(email, "e2e-password", `Rookie ${stamp}`);
      rookieJwt = await anon.getJwt(email, "e2e-password");
    } finally {
      await anon.dispose();
    }
  });

  test("a never-onboarded user is taken to the wizard and can finish it", async ({ browser }) => {
    const page = await authedPage(browser, rookieJwt);
    try {
      await page.goto("/");

      await expect(page.getByText("Set up your profile")).toBeVisible({ timeout: T(15_000) });
      await page.getByRole("button", { name: "Next" }).click();

      await expect(page.getByRole("button", { name: "Done" })).toBeVisible({ timeout: T(10_000) });
      await page.getByRole("button", { name: "Done" }).click();

      await expect(page.getByText("Set up your profile")).toHaveCount(0, { timeout: T(10_000) });
    } finally {
      await page.context().close();
    }
  });

  test("the wizard does not come back once completed", async ({ browser }) => {
    const page = await authedPage(browser, rookieJwt);
    try {
      await page.goto("/");
      await expect(page.getByTestId(testIds.profileMenuButton)).toBeVisible({ timeout: T(15_000) });
      await expect(page.getByText("Set up your profile")).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });
});
