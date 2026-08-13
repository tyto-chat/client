import { expect, devices } from "@playwright/test";
import { test as worldTest } from "./worldFixtures";
import { testIds } from "./testIds";
import { setupServerInfoRoute, attachPageDiagnostics, T } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * M4 — touch-accessible message actions.
 *
 * The per-message `⋯` overflow trigger is rendered ONLY on coarse/non-hover
 * pointer devices (`(hover: none)` media query = true). This file verifies:
 *
 *  1. With Pixel 7 emulation (hover:none=true) the trigger IS visible.
 *  2. With Desktop Chrome (hover:none=false) the trigger is ABSENT.
 *  3. Tapping the trigger force-shows the action bar for that message,
 *     exposing the same actions (react, edit, delete, …) that the hover bar
 *     shows on desktop.
 *  4. Tapping outside the bar closes it.
 *
 * NOTE: Pixel 7 device emulation in Playwright Chromium does emulate
 * `(hover: none)` = true (verified by probe tests). This is the only
 * mechanism that activates `useIsTouch()` in the component.
 */

/**
 * Build a touch-emulated (Pixel 7) authenticated page.
 * Mirrors `authedPage()` in worldFixtures, but layers Pixel 7 device settings
 * on top of the context so `(hover: none)` evaluates to true in the app.
 */
async function touchAuthedPage(
  browser: import("@playwright/test").Browser,
  jwt: string,
  testInfo: import("@playwright/test").TestInfo,
): Promise<Page> {
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    ignoreHTTPSErrors: true,
  });
  await setupServerInfoRoute(ctx);
  await ctx.addInitScript((token) => {
    (window as unknown as { __TYTO_DEV_TOKEN__?: string }).__TYTO_DEV_TOKEN__ = token;
  }, jwt);
  const page = await ctx.newPage();
  attachPageDiagnostics(page, testInfo);
  return page;
}

worldTest.describe.serial("M4 — touch message-actions trigger (Pixel 7 emulation)", () => {
  worldTest(
    "touch ⋯ trigger is visible after sending a message on Pixel 7",
    async ({ browser, world }, testInfo) => {
      const page = await touchAuthedPage(browser, world.adminJwt, testInfo);
      try {
        await page.goto(`/${world.communityId}/${world.textChannelId}`);

        // Wait for the mobile top bar (present at Pixel 7's 412px viewport).
        await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

        const editor = page.locator("main").locator('[contenteditable="true"]');
        await editor.tap();
        await editor.fill(`M4 touch test ${Date.now()}`);
        await editor.press("Enter");

        const lastContent = page.locator("main .message-content").last();
        await expect(lastContent).toBeAttached({ timeout: T(8_000) });

        // The ⋯ trigger must be present (rendered because hover:none=true).
        const trigger = page.getByTestId(testIds.msgTouchActionsBtn).last();
        await expect(trigger).toBeAttached({ timeout: T(5_000) });
        await expect(trigger).toBeVisible({ timeout: T(5_000) });

        // Minimum 44 × 44 px touch target.
        const box = await trigger.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      } finally {
        await page.context().close();
      }
    },
  );

  worldTest(
    "⋯ trigger is absent on Desktop Chrome (pointer/hover device)",
    async ({ adminPage: page, world }) => {
      await page.goto(`/${world.communityId}/${world.textChannelId}`);
      await expect(page.locator("main .message-content").last()).toBeAttached({
        timeout: T(15_000),
      });
      await expect(page.getByTestId(testIds.msgTouchActionsBtn)).toHaveCount(0);
    },
  );

  worldTest(
    "tapping ⋯ opens the message action bar with Edit/Delete actions",
    async ({ browser, world }, testInfo) => {
      const page = await touchAuthedPage(browser, world.adminJwt, testInfo);
      try {
        await page.goto(`/${world.communityId}/${world.textChannelId}`);
        await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

        const uniqueText = `M4 actions open ${Date.now()}`;
        const editor = page.locator("main").locator('[contenteditable="true"]');
        await editor.tap();
        await editor.fill(uniqueText);
        await editor.press("Enter");

        const ourMsg = page.locator("main").getByText(uniqueText, { exact: false });
        await expect(ourMsg).toBeVisible({ timeout: T(8_000) });

        // The ⋯ trigger for our message — use the last one in main (our freshly sent msg).
        const trigger = page.locator("main").getByTestId(testIds.msgTouchActionsBtn).last();
        await expect(trigger).toBeVisible({ timeout: T(5_000) });

        await trigger.tap();

        // Confirm the action bar appeared. Since this is our own message, Edit and Delete
        // are expected. Use .filter({ visible:true }) to find the now-visible ones.
        await expect(
          page.locator("main").getByTestId(testIds.msgActionEdit).filter({ visible: true }).last(),
        ).toBeVisible({ timeout: T(5_000) });
        await expect(
          page
            .locator("main")
            .getByTestId(testIds.msgActionDelete)
            .filter({ visible: true })
            .last(),
        ).toBeVisible({ timeout: T(5_000) });
      } finally {
        await page.context().close();
      }
    },
  );

  worldTest(
    "the ⋯ trigger yields to the open bar, and tapping outside closes it",
    async ({ browser, world }, testInfo) => {
      const page = await touchAuthedPage(browser, world.adminJwt, testInfo);
      try {
        await page.goto(`/${world.communityId}/${world.textChannelId}`);
        await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

        const uniqueText = `M4 actions close ${Date.now()}`;
        const editor = page.locator("main").locator('[contenteditable="true"]');
        await editor.tap();
        await editor.fill(uniqueText);
        await editor.press("Enter");

        // Pin the row by its own text. Other messages keep their triggers, so a
        // bare .last() would both miss this row and drift as new rows arrive.
        const row = page.locator("main [data-message-id]").filter({ hasText: uniqueText }).last();
        await expect(row).toBeVisible({ timeout: T(8_000) });
        const trigger = row.getByTestId(testIds.msgTouchActionsBtn);
        await expect(trigger).toBeVisible({ timeout: T(5_000) });

        await trigger.tap();
        await expect(row.getByTestId(testIds.msgActionEdit)).toBeVisible({ timeout: T(5_000) });

        // The bar occupies the trigger's slot, so the trigger stands down while
        // it is open — no second tap on it, and no overlap to mis-hit.
        await expect(trigger).toHaveCount(0, { timeout: T(3_000) });

        // Tapping anywhere outside dismisses it and the trigger comes back.
        await page.mouse.click(10, 10);
        await expect(row.getByTestId(testIds.msgActionEdit)).toBeHidden({ timeout: T(3_000) });
        await expect(trigger).toBeVisible({ timeout: T(3_000) });
      } finally {
        await page.context().close();
      }
    },
  );

  worldTest(
    "action bar is a single scrollable row that fits the viewport",
    async ({ browser, world }, testInfo) => {
      const page = await touchAuthedPage(browser, world.adminJwt, testInfo);
      try {
        await page.goto(`/${world.communityId}/${world.textChannelId}`);
        await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

        const editor = page.locator("main").locator('[contenteditable="true"]');
        await editor.tap();
        await editor.fill(`M4 fit ${Date.now()}`);
        await editor.press("Enter");

        const trigger = page.locator("main").getByTestId(testIds.msgTouchActionsBtn).last();
        await expect(trigger).toBeVisible({ timeout: T(8_000) });
        await trigger.tap();

        // Admin's own message exposes the fullest action set (react, reply,
        // copy-link, pin, edit, delete, …). On mobile the bar stays a SINGLE
        // row that scrolls horizontally rather than wrapping onto two lines.
        const row = page
          .locator("main")
          .getByTestId(testIds.msgActionsRow)
          .filter({ visible: true })
          .last();
        await expect(row).toBeVisible({ timeout: T(5_000) });

        // The scroll container itself must fit within the viewport width.
        const vw = page.viewportSize()?.width ?? 412;
        const rowBox = await row.boundingBox();
        expect(rowBox).not.toBeNull();
        expect(rowBox!.x).toBeGreaterThanOrEqual(0);
        expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(vw + 1);

        // Single line: every button shares the same top — no wrap to a 2nd row.
        // (When the set is wide enough to exceed the width, the row scrolls
        // horizontally; overflow:auto is asserted structurally, not by count.)
        const distinctTops = await row.evaluate((el) => {
          const tops = Array.from(el.children).map((k) =>
            Math.round(k.getBoundingClientRect().top),
          );
          return new Set(tops).size;
        });
        expect(distinctTops).toBe(1);
        await expect(row).toHaveCSS("overflow-x", "auto");
      } finally {
        await page.context().close();
      }
    },
  );

  worldTest(
    "touch trigger → Add reaction button is reachable",
    async ({ browser, world }, testInfo) => {
      const page = await touchAuthedPage(browser, world.adminJwt, testInfo);
      try {
        await page.goto(`/${world.communityId}/${world.textChannelId}`);
        await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

        const editor = page.locator("main").locator('[contenteditable="true"]');
        await editor.tap();
        await editor.fill(`M4 reaction ${Date.now()}`);
        await editor.press("Enter");

        const lastContent = page.locator("main .message-content").last();
        await expect(lastContent).toBeAttached({ timeout: T(8_000) });

        const trigger = page.getByTestId(testIds.msgTouchActionsBtn).last();
        await trigger.tap();

        // Every message keeps a hidden action bar in the DOM, so filter to the
        // visible ones — a bare .last() can resolve to a closed row's button.
        await expect(
          page.locator("main").getByTestId(testIds.msgActionReact).filter({ visible: true }).last(),
        ).toBeVisible({ timeout: T(5_000) });
      } finally {
        await page.context().close();
      }
    },
  );
});
