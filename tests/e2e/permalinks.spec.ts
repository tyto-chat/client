import { devices, type Browser, type Page, type TestInfo } from "@playwright/test";
import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { setupServerInfoRoute, attachPageDiagnostics, E2E_BASE_URL } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Message permalinks (/m/<uuid>) end to end: copy-link roundtrip for a
 * signed-in user, and the anonymous path — public-channel permalinks are
 * deliberately viewable logged-out (MessageVoter delegates to ChannelVoter).
 */

async function clipboardAuthedPage(
  browser: Browser,
  jwt: string,
  testInfo: TestInfo,
): Promise<Page> {
  const ctx = await browser.newContext({
    ...devices["Desktop Chrome"],
    ignoreHTTPSErrors: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await setupServerInfoRoute(ctx);
  await ctx.addInitScript((token) => {
    (window as unknown as { __TYTO_DEV_TOKEN__?: string }).__TYTO_DEV_TOKEN__ = token;
  }, jwt);
  const page = await ctx.newPage();
  attachPageDiagnostics(page, testInfo);
  return page;
}

async function copyPermalinkOfLastMessage(page: Page): Promise<string> {
  await page.locator("main .message-content").last().hover();
  const copyBtn = page.getByTestId(testIds.msgActionCopyLink).last();
  await expect(copyBtn).toBeVisible({ timeout: 5_000 });
  await copyBtn.click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/m\/[0-9a-f-]{36}$/);
  return url;
}

test.describe.serial("Message permalinks", () => {
  let permalink = "";
  let messageText = "";

  test("copy link → visiting it lands on the channel and flashes the message", async ({
    browser,
    world,
  }, testInfo) => {
    const page = await clipboardAuthedPage(browser, world.adminJwt, testInfo);
    try {
      await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
      const channel = new ChannelPage(page);
      messageText = `Permalink target ${Date.now()}`;
      await channel.sendMessage(messageText);
      await channel.expectMessage(messageText);

      permalink = await copyPermalinkOfLastMessage(page);

      await page.goto(permalink);
      await expect(page).toHaveURL(new RegExp(`/${world.communityId}/${world.textChannelId}`), {
        timeout: 15_000,
      });
      await expect(page.locator("main").getByText(messageText, { exact: false })).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await page.context().close();
    }
  });

  test("anonymous visitor can open a public-channel permalink", async ({ page }) => {
    test.skip(permalink === "", "depends on the copy-link test having run");

    await page.goto(permalink.replace(/^https?:\/\/[^/]+/, E2E_BASE_URL));
    await expect(page.locator("main").getByText(messageText, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    // Still anonymous: guest prompt visible, no editor.
    await expect(page.locator("main").locator('[contenteditable="true"]')).toHaveCount(0);
  });

  test("anonymous visitor gets the unavailable page for a bogus permalink", async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/m/00000000-0000-4000-8000-000000000000`);
    await expect(page.getByText(/not available|unavailable/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
