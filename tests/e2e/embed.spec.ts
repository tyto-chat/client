import { devices, type Browser, type Page, type TestInfo } from "@playwright/test";
import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { setupServerInfoRoute, attachPageDiagnostics, E2E_BASE_URL, T } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * /embed/m/<uuid> — the standalone embeddable card. It renders outside the
 * authenticated shell and must work for a fully anonymous visitor on a
 * public-community message (that is its whole purpose: third-party sites).
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

test.describe.serial("Embeddable message card", () => {
  let uuid = "";
  let messageText = "";

  test.beforeAll(async ({ browser, world }, testInfo) => {
    const page = await clipboardAuthedPage(browser, world.adminJwt, testInfo);
    try {
      await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
      const channel = new ChannelPage(page);
      messageText = `Embed target ${Date.now()}`;
      await channel.sendMessage(messageText);
      await channel.expectMessage(messageText);

      // Wait for the Mercure echo to swap the optimistic id for the real IRI —
      // copying earlier yields a dead /m/optimistic-… link.
      await expect(page.locator("[data-message-id]").last()).not.toHaveAttribute(
        "data-message-id",
        /optimistic/,
        { timeout: T(10_000) },
      );
      await page.locator("main .message-content").last().hover();
      const copyBtn = page.getByTestId(testIds.msgActionCopyLink).last();
      await expect(copyBtn).toBeVisible({ timeout: T(5_000) });
      await copyBtn.click();
      const url = await page.evaluate(() => navigator.clipboard.readText());
      uuid = url.split("/m/")[1] ?? "";
      expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await page.context().close();
    }
  });

  test("anonymous visitor sees the card with the message text", async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/embed/m/${uuid}`);
    const card = page.locator(".embed-card");
    await expect(card).toBeVisible({ timeout: T(15_000) });
    await expect(card).not.toHaveClass(/embed-card--unavailable/);
    await expect(card.getByText(messageText, { exact: false })).toBeVisible({ timeout: T(8_000) });
  });

  test("card links back to the full message permalink", async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/embed/m/${uuid}`);
    const link = page.locator(`a.embed-card[href*="/m/${uuid}"]`).first();
    await expect(link).toBeAttached({ timeout: T(15_000) });
  });

  test("unknown uuid renders the unavailable card, not an error page", async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/embed/m/00000000-0000-4000-8000-000000000000`);
    await expect(page.locator(".embed-card--unavailable")).toBeVisible({ timeout: T(15_000) });
  });
});
