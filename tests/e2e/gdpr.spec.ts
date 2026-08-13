/**
 * GDPR self-service — data export request, account deletion, grace-period cancel.
 *
 * Both throwaway accounts: scheduling deletion revokes API keys and push
 * subscriptions and puts the account behind the pending-deletion gate, which
 * would wreck any shared fixture user.
 *
 * The export archive is built inline in this environment, so the export test
 * asserts a real download link rather than just a queued state.
 */

import { test, expect } from "./worldFixtures";
import { authedPage } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { testIds } from "./testIds";
import type { Page } from "@playwright/test";

let exporter: { jwt: string; name: string; email: string };
let leaver: { jwt: string; name: string; email: string };

async function openAccountPanel(page: Page): Promise<void> {
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(6_000) });
  await page.getByTestId(testIds.prefTabAccount).click();
}

test.describe.serial("GDPR self-service", () => {
  test.beforeAll(async ({ world }) => {
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      exporter = await wb.createMember(world.communityId, "Gdpr Exporter");
      leaver = await wb.createMember(world.communityId, "Gdpr Leaver");
    } finally {
      await wb.dispose();
    }
  });

  test("requesting a data export is accepted and reported as queued", async ({
    browser,
    world,
  }) => {
    const page = await authedPage(browser, exporter.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await openAccountPanel(page);

      await expect(page.getByText("Download your data")).toBeVisible({ timeout: T(8_000) });
      await page.getByRole("button", { name: "Request export" }).click();

      // The export handler runs inline in this environment, so the archive is
      // built for real — assert the download link, not just the queued state.
      await expect(page.getByRole("link", { name: "Download archive" })).toBeVisible({
        timeout: T(20_000),
      });
      await expect(page.getByRole("button", { name: "Request again" })).toBeVisible();
    } finally {
      await page.context().close();
    }
  });

  test("deletion needs the account's own email typed to confirm", async ({ browser, world }) => {
    const page = await authedPage(browser, leaver.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await openAccountPanel(page);

      await page.getByRole("button", { name: "Delete my account" }).click();
      const dialog = page.getByRole("dialog").last();
      await expect(dialog.getByPlaceholder(leaver.email)).toBeVisible({ timeout: T(8_000) });

      const submit = dialog.getByRole("button", { name: "Schedule deletion" });
      await expect(submit).toBeDisabled();

      await dialog.getByPlaceholder(leaver.email).fill("wrong@example.com");
      await expect(submit).toBeDisabled();

      await dialog.getByPlaceholder(leaver.email).fill(leaver.email);
      await expect(submit).toBeEnabled();
    } finally {
      await page.context().close();
    }
  });

  test("scheduling deletion puts the account behind the pending-deletion gate", async ({
    browser,
    world,
  }) => {
    const page = await authedPage(browser, leaver.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await openAccountPanel(page);

      await page.getByRole("button", { name: "Delete my account" }).click();
      const dialog = page.getByRole("dialog").last();
      await dialog.getByPlaceholder(leaver.email).fill(leaver.email);
      await dialog.getByRole("button", { name: "Schedule deletion" }).click();

      // The gate renders in place over whatever route the user was on — the URL
      // does not change.
      await expect(page.getByRole("button", { name: "Cancel deletion" })).toBeVisible({
        timeout: T(10_000),
      });
      await expect(page.getByText(/scheduled for deletion/i).first()).toBeVisible();
    } finally {
      await page.context().close();
    }
  });

  test("the scheduled deletion can be cancelled within the grace period", async ({
    browser,
    world,
  }) => {
    const page = await authedPage(browser, leaver.jwt);
    try {
      await page.goto("/account-pending-deletion");
      await expect(page.getByRole("button", { name: "Cancel deletion" })).toBeVisible({
        timeout: T(10_000),
      });
      await page.getByRole("button", { name: "Cancel deletion" }).click();

      // Assert the lock lifting rather than the toast — the toast auto-dismisses.
      await expect(page.getByRole("button", { name: "Cancel deletion" })).toHaveCount(0, {
        timeout: T(10_000),
      });

      await page.goto(`/${world.communityId}`);
      await expect(page.locator("aside")).toBeVisible({ timeout: T(10_000) });
      await expect(page.getByRole("button", { name: "Cancel deletion" })).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });
});
