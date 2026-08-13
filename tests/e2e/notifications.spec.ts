import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { ChannelSidebar } from "../pages/ChannelSidebar";
import { AppShell } from "../pages/AppShell";
import { T } from "./fixtures";

/**
 * Notification tests rely on the `channel_access` notification type which is
 * created when an admin adds a community member to a private channel.
 * This avoids the need for email delivery or @mention markup.
 */
test.describe.serial("Notifications", () => {
  test("channel_access notification appears and can be marked as read", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    // Use a unique name so this test is independent of prior runs that may not
    // have fully cleaned up the test database.
    const channelName = `notif-channel-${Date.now()}`;

    // Admin creates a private channel and adds the world user to it
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: channelName, type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar(channelName);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelName);
    await shell.openManageChannelAccess();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: T(6_000) });
    await modal.getByRole("textbox").nth(1).fill(world.userName);
    await expect(modal.getByText(world.userName)).toBeVisible({ timeout: T(6_000) });
    await modal.getByRole("button", { name: "Add" }).click();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });

    // Open user context — notification should already exist in DB
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await userPage.goto(`/${world.communityId}`);
      await expect(userPage.locator("aside")).toBeVisible({ timeout: T(8_000) });

      // Unread count badge should be visible on the bell.
      // Exact match: per-channel hover bells carry titles like "Notifications:
      // Mentions only" which substring-match a bare "Notifications" (→ 18 hits).
      const bell = userPage.getByTestId(testIds.notificationBell);
      await expect(userPage.getByTestId(testIds.notificationUnreadBadge)).toBeVisible({
        timeout: T(6_000),
      });

      await bell.click();
      const panel = userPage.getByText("Notifications").first();
      await expect(panel).toBeVisible({ timeout: T(6_000) });

      await expect(
        userPage.getByText(new RegExp(`you now have access to.*#${channelName}`, "i")),
      ).toBeVisible({ timeout: T(6_000) });

      await userPage.getByRole("button", { name: "Mark all as read" }).click();
      await expect(userPage.getByTestId(testIds.notificationUnreadBadge)).not.toBeVisible({
        timeout: T(6_000),
      });
    } finally {
      await userPage.context().close();
    }
  });
});

/**
 * Notification preference tests — per-channel level + community mute.
 * All tests use `userPage` (real member, not admin bypass) since the preference
 * UI is gated on a real `CommunityMembership.hasMembership` row.
 */
test.describe.serial("Notification preferences", () => {
  /**
   * Helper: hover a channel row in the sidebar and force-click its notification
   * menu bell. The bell is opacity-0 until the row is group-hovered.
   */
  async function openChannelNotifMenu(page: import("@playwright/test").Page, channelHref: string) {
    const row = page.locator(`aside a[href$="/${channelHref}"]`).locator("..");
    await row.hover();
    const btn = row.getByTestId(testIds.channelNotifMenuBtn);
    await btn.click({ force: true });
  }

  test("per-channel notification level — set, reflects, persists, restore", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openChannelNotifMenu(page, world.textChannelId);

    await expect(page.getByTestId(testIds.notifLevelAll)).toBeVisible({ timeout: T(6_000) });
    await expect(page.getByTestId(testIds.notifLevelMentions)).toBeVisible({ timeout: T(6_000) });
    await expect(page.getByTestId(testIds.notifLevelNone)).toBeVisible({ timeout: T(6_000) });

    // Default is "mentions" — the mentions button should have the check icon (svg)
    await expect(page.getByTestId(testIds.notifLevelMentions).locator("svg")).toBeVisible({
      timeout: T(6_000),
    });

    await page.getByTestId(testIds.notifLevelNone).click();

    // Dropdown closes; the bell now shows at-rest (deviates from default).
    // Re-open the menu to confirm "none" is selected.
    await openChannelNotifMenu(page, world.textChannelId);
    await expect(page.getByTestId(testIds.notifLevelNone).locator("svg")).toBeVisible({
      timeout: T(6_000),
    });
    await expect(page.getByTestId(testIds.notifLevelMentions).locator("svg")).not.toBeVisible({
      timeout: T(6_000),
    });

    await page.keyboard.press("Escape");

    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });
    await openChannelNotifMenu(page, world.textChannelId);
    await expect(page.getByTestId(testIds.notifLevelNone).locator("svg")).toBeVisible({
      timeout: T(6_000),
    });

    // Restore to default ("mentions") so this test leaves no side-effects
    await page.getByTestId(testIds.notifLevelMentions).click();
    await openChannelNotifMenu(page, world.textChannelId);
    await expect(page.getByTestId(testIds.notifLevelMentions).locator("svg")).toBeVisible({
      timeout: T(6_000),
    });
    await page.keyboard.press("Escape");
  });

  test("community mute toggle — set, reflects, persists, restore", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    const bell = page.getByTestId(testIds.notificationBell);
    await bell.click();

    // Community mute toggle is visible (user is a real member)
    const muteToggle = page.getByTestId(testIds.communityMuteToggle);
    await expect(muteToggle).toBeVisible({ timeout: T(6_000) });

    // Default is not muted — the toggle track should NOT have the red class
    const track = muteToggle.locator(".rounded-full").first();
    await expect(track).not.toHaveClass(/bg-red-500/, { timeout: T(6_000) });

    await muteToggle.click();
    await expect(track).toHaveClass(/bg-red-500/, { timeout: T(6_000) });

    await page.keyboard.press("Escape");

    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });
    await page.getByTestId(testIds.notificationBell).click();
    const muteToggleAfterReload = page.getByTestId(testIds.communityMuteToggle);
    await expect(muteToggleAfterReload).toBeVisible({ timeout: T(6_000) });
    const trackAfterReload = muteToggleAfterReload.locator(".rounded-full").first();
    await expect(trackAfterReload).toHaveClass(/bg-red-500/, { timeout: T(6_000) });

    // Restore: toggle mute OFF
    await muteToggleAfterReload.click();
    await expect(trackAfterReload).not.toHaveClass(/bg-red-500/, { timeout: T(6_000) });
  });
});
