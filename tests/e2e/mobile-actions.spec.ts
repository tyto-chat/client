import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { MobilePage } from "../pages/MobilePage";
import { T } from "./fixtures";

/**
 * M2 mobile top-bar overflow menu + M3 thread panel full-screen drawer.
 *
 * All tests run at a phone viewport (390×844) where MobileTopBar is visible
 * and the `⋯` overflow menu exposes channel actions.  Desktop layout (≥ md) is
 * fully covered by the rest of the suite.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe.serial("Mobile action menu + thread overlay (390px)", () => {
  test("mobile-action-menu-btn is visible in the top bar", async ({ userPage: page, world }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await expect(page.getByTestId(testIds.mobileSearchOpenBtn)).toBeVisible();

    await expect(page.getByTestId(testIds.mobileActionMenuBtn)).toBeVisible();
  });

  test("tapping ⋯ opens the overflow menu", async ({ userPage: page, world }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await expect(page.getByTestId(testIds.mobileActionMenuBtn)).toBeVisible();
    const menuBtn = page.getByTestId(testIds.mobileActionMenuBtn);

    await expect(page.getByRole("button", { name: /Pinned/i }).first()).toBeHidden();

    await menuBtn.click();

    await expect(page.getByRole("button", { name: /Pinned/i }).first()).toBeVisible({
      timeout: T(5_000),
    });
  });

  test("tapping 'Search' direct button opens the search dialog", async ({
    userPage: page,
    world,
  }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.mobileSearchOpenBtn).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(5_000) });
  });

  test("tapping 'Pinned messages' in overflow opens the pinned modal", async ({
    adminPage: page,
    world,
  }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.mobileActionMenuBtn).click();

    await page
      .getByRole("button", { name: /Pinned/i })
      .first()
      .click();

    await expect(page.getByTestId(testIds.pinnedMessagesModal)).toBeVisible({ timeout: T(8_000) });
  });

  test("clicking outside the overflow menu closes it", async ({ userPage: page, world }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.mobileActionMenuBtn).click();
    await expect(page.getByRole("button", { name: /Pinned/i }).first()).toBeVisible({
      timeout: T(5_000),
    });

    await page.locator("main").click({ position: { x: 100, y: 300 }, force: true });

    await expect(page.getByRole("button", { name: /Pinned/i }).first()).not.toBeVisible({
      timeout: T(3_000),
    });
  });

  test("thread panel fills the screen on mobile", async ({ adminPage: page, world }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    const editor = page.locator("main").locator('[contenteditable="true"]');
    await editor.click();
    await editor.fill(`M3 thread test ${Date.now()}`);
    await editor.press("Enter");

    const lastMsg = page.locator("main .message-content").last();
    await expect(lastMsg).toBeAttached({ timeout: T(8_000) });
    // Hidden action bars stay in the DOM, so filter to the hovered row's visible one.
    const replyBtn = page.getByTestId(testIds.msgActionReply).filter({ visible: true }).last();
    await lastMsg.hover();
    await expect(replyBtn).toBeAttached({ timeout: T(8_000) });
    await expect(replyBtn).toBeVisible({ timeout: T(5_000) });
    await replyBtn.click();

    const panel = page.getByTestId(testIds.threadPanel);
    await expect(panel).toBeVisible({ timeout: T(8_000) });
    await expect(panel).toBeInViewport();

    // The panel's bounding box should cover most of the viewport (≥ 95% width).
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(370); // 390 * 0.95

    // The close button inside the thread header must be tappable (≥ 44px).
    const closeBtn = panel.getByRole("button", { name: /close/i });
    await expect(closeBtn).toBeVisible();
    const closeBox = await closeBtn.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);

    await closeBtn.click();
    await expect(panel).not.toBeVisible({ timeout: T(5_000) });
  });
});
