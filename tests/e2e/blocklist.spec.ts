import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { WorldBuilder } from "./world/builder";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import type { Page } from "@playwright/test";

async function blockViaProfile(page: Page, name: string): Promise<void> {
  await page
    .locator("main")
    .getByTestId(testIds.msgAuthorName)
    .filter({ hasText: name })
    .last()
    .click();
  await page.getByTestId(testIds.profileBlockButton).click();
  await page.getByTestId(testIds.confirmDialogConfirm).click();
  await expect(page.getByTestId(testIds.profileUnblockButton)).toBeVisible({ timeout: T(8_000) });
  await page.keyboard.press("Escape");
}

async function unblockViaPreferences(page: Page, name: string): Promise<void> {
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(6_000) });
  await page.getByTestId("pref-tab-privacy").click();
  const row = page.getByTestId(testIds.blockedUserRow).filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: T(8_000) });
  await row.getByRole("button", { name: /Unblock/ }).click();
  await expect(row).toHaveCount(0, { timeout: T(8_000) });
}

test.describe.serial("Blocklist", () => {
  let a: { jwt: string; name: string; email: string };
  let b: { jwt: string; name: string; email: string };
  let aId: number;

  test.beforeAll(async ({ world }) => {
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL);
    await wb.init();
    try {
      a = await wb.createMember(world.communityId, "Block Alice");
      b = await wb.createMember(world.communityId, "Block Bob");
    } finally {
      await wb.dispose();
    }
    const bApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, b.jwt);
    await bApi.init();
    try {
      aId = await bApi.findUserIdByName(a.name);
      await bApi.sendChannelMessages(world.communityId, world.textChannelId, [
        `hello from bob ${Date.now()}`,
      ]);
    } finally {
      await bApi.dispose();
    }
  });

  test("block refuses a DM, unblock allows it", async ({ browser, world }) => {
    const page = await authedPage(browser, a.jwt);
    try {
      await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
      await blockViaProfile(page, b.name);

      const bApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, b.jwt);
      await bApi.init();
      try {
        expect(await bApi.tryCreateConversation([aId])).toBe(422);

        await unblockViaPreferences(page, b.name);

        expect(await bApi.tryCreateConversation([aId])).toBe(201);
      } finally {
        await bApi.dispose();
      }
    } finally {
      await page.context().close();
    }
  });

  test("blocked user's channel message is collapsed until Show", async ({ browser, world }) => {
    const page = await authedPage(browser, a.jwt);
    const text = `secret from bob ${Date.now()}`;
    try {
      await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
      await blockViaProfile(page, b.name);

      const bApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, b.jwt);
      await bApi.init();
      try {
        await bApi.sendChannelMessages(world.communityId, world.textChannelId, [text]);
      } finally {
        await bApi.dispose();
      }

      await page.reload();
      const main = page.locator("main");
      await expect(main.getByTestId(testIds.blockedMessageRow).first()).toBeVisible({
        timeout: T(10_000),
      });
      await expect(main.getByText(text)).toHaveCount(0);

      await main.getByTestId(testIds.blockedMessageShow).last().click();
      await expect(main.getByText(text)).toBeVisible({ timeout: T(8_000) });
    } finally {
      await page.context().close();
    }
  });
});
