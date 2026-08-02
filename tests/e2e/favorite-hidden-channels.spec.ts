import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";

/**
 * Favorite & Hidden channels — per-user star/hide + sidebar sections.
 *
 * Feature: any member can favorite or hide a channel from their own view.
 * The state is server-persisted and reflected in the sidebar via the
 * "Favorites" and "Hidden" collapsible sections.
 *
 * UX flow to toggle:
 *   1. Hover a channel row in the sidebar → the "More actions" (…) button
 *      becomes visible.
 *   2. Click the ellipsis → a small dropdown appears with "Favorite" / "Hide"
 *      (or "Remove from favorites" / "Unhide" when already set).
 *   3. Click the desired action.
 *
 * testids added to ChannelSidebar.tsx:
 *   - `sidebar-favorites-section`  — outer div wrapping the Favorites section
 *   - `sidebar-hidden-section`     — outer div wrapping the Hidden section
 *   - `channel-more-actions-btn`   — the … ellipsis button on each channel row
 *   - `channel-favorite-btn`       — "Favorite" / "Remove from favorites" item
 *   - `channel-hide-btn`           — "Hide" / "Unhide" item
 *
 * Test order (serial, single userPage actor so state shares across tests):
 *   1. favorite → channel appears in Favorites section; unfavorite → back to normal
 *   2. hide → channel appears in Hidden section (auto-collapsed: expand first)
 *   3. unhide → channel returns to normal section
 *   4. persist across reload — favorite + reload → still in Favorites; cleanup
 *
 * Each test leaves the channel in the unfavorited/unhidden state so later
 * tests start clean.
 */

/**
 * Open the channel row's "More actions" dropdown.
 * The ellipsis button is opacity-0 until the row is hovered; we hover then
 * force-click to bypass the CSS visibility guard.
 */
async function openChannelMenu(
  page: import("@playwright/test").Page,
  channelIdentifier: string,
  communityId: string,
): Promise<void> {
  const row = page.locator(`aside div.group`).filter({
    has: page.locator(`a[href$="/${communityId}/${channelIdentifier}"]`),
  });
  await row.hover();
  const moreBtn = row.getByTestId(testIds.channelMoreActionsBtn);
  await expect(moreBtn).toBeAttached({ timeout: 6_000 });
  await moreBtn.click({ force: true });
}

test.describe.serial("Favorite & Hidden channels", () => {
  test("favorite a channel — appears in Favorites section; unfavorite removes it", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await expect(page.getByTestId(testIds.sidebarFavoritesSection)).not.toBeVisible({
      timeout: 5_000,
    });

    await openChannelMenu(page, world.textChannelId, world.communityId);
    const favoriteBtn = page.getByTestId(testIds.channelFavoriteBtn);
    await expect(favoriteBtn).toBeVisible({ timeout: 4_000 });
    await favoriteBtn.click();

    const favSection = page.getByTestId(testIds.sidebarFavoritesSection);
    await expect(favSection).toBeVisible({ timeout: 8_000 });
    await expect(
      favSection.locator(`a[href$="/${world.communityId}/${world.textChannelId}"]`),
    ).toBeVisible({ timeout: 8_000 });

    // --- Cleanup: unfavorite ---
    await openChannelMenu(page, world.textChannelId, world.communityId);
    const unfavoriteBtn = page.getByTestId(testIds.channelFavoriteBtn);
    await expect(unfavoriteBtn).toBeVisible({ timeout: 4_000 });
    await expect(unfavoriteBtn).toHaveText(/remove from favorites/i);
    await unfavoriteBtn.click();

    await expect(page.getByTestId(testIds.sidebarFavoritesSection)).not.toBeVisible({
      timeout: 8_000,
    });

    await expect(
      page.locator(`aside a[href$="/${world.communityId}/${world.textChannelId}"]`),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("hide a channel — moves to Hidden section", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await expect(page.getByTestId(testIds.sidebarHiddenSection)).not.toBeVisible({
      timeout: 5_000,
    });

    await openChannelMenu(page, world.textChannelId, world.communityId);
    const hideBtn = page.getByTestId(testIds.channelHideBtn);
    await expect(hideBtn).toBeVisible({ timeout: 4_000 });
    await expect(hideBtn).toHaveText(/^hide$/i);
    await hideBtn.click();

    // The Hidden section should appear. It starts collapsed by default.
    const hiddenSection = page.getByTestId(testIds.sidebarHiddenSection);
    await expect(hiddenSection).toBeVisible({ timeout: 8_000 });

    const collapseToggle = hiddenSection.locator("button").first();
    const channelInHidden = hiddenSection.locator(
      `a[href$="/${world.communityId}/${world.textChannelId}"]`,
    );
    // eslint-disable-next-line playwright/no-conditional-in-test -- section may start collapsed; expand only then
    if (!(await channelInHidden.isVisible())) {
      await collapseToggle.click();
    }
    await expect(channelInHidden).toBeVisible({ timeout: 8_000 });

    const allChannelLinks = page.locator(
      `aside a[href$="/${world.communityId}/${world.textChannelId}"]`,
    );
    // All visible links for this channel should be inside the hidden section.
    await expect(allChannelLinks).toHaveCount(1, { timeout: 6_000 });
    await expect(channelInHidden).toBeVisible();
  });

  /**
   * Test 3 — unhide → channel returns to normal section.
   *
   * Depends on test 2 leaving the channel hidden.
   */
  test("unhide a channel — returns to normal section", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const hiddenSection = page.getByTestId(testIds.sidebarHiddenSection);
    await expect(hiddenSection).toBeVisible({ timeout: 8_000 });

    const collapseToggle = hiddenSection.locator("button").first();
    const channelInHidden = hiddenSection.locator(
      `a[href$="/${world.communityId}/${world.textChannelId}"]`,
    );
    // eslint-disable-next-line playwright/no-conditional-in-test -- section may start collapsed; expand only then
    if (!(await channelInHidden.isVisible())) {
      await collapseToggle.click();
    }
    await expect(channelInHidden).toBeVisible({ timeout: 8_000 });

    // The channel link is inside the hidden section — use the shared helper to
    // open its row menu. The helper scans the entire aside so it finds the row
    // regardless of which section it lives in.
    await openChannelMenu(page, world.textChannelId, world.communityId);

    const unhideBtn = page.getByTestId(testIds.channelHideBtn);
    await expect(unhideBtn).toBeVisible({ timeout: 4_000 });
    await expect(unhideBtn).toHaveText(/unhide/i);
    await unhideBtn.click();

    await expect(page.getByTestId(testIds.sidebarHiddenSection)).not.toBeVisible({
      timeout: 8_000,
    });

    await expect(
      page.locator(`aside a[href$="/${world.communityId}/${world.textChannelId}"]`),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("favorite persists across page reload", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await openChannelMenu(page, world.textChannelId, world.communityId);
    const favoriteBtn = page.getByTestId(testIds.channelFavoriteBtn);
    await expect(favoriteBtn).toBeVisible({ timeout: 4_000 });
    await favoriteBtn.click();
    await expect(page.getByTestId(testIds.sidebarFavoritesSection)).toBeVisible({ timeout: 8_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("aside")).toBeVisible({ timeout: 10_000 });

    const favSection = page.getByTestId(testIds.sidebarFavoritesSection);
    await expect(favSection).toBeVisible({ timeout: 8_000 });
    await expect(
      favSection.locator(`a[href$="/${world.communityId}/${world.textChannelId}"]`),
    ).toBeVisible({ timeout: 8_000 });

    // --- Cleanup: unfavorite so subsequent worker tests start clean ---
    await openChannelMenu(page, world.textChannelId, world.communityId);
    const unfavoriteBtn = page.getByTestId(testIds.channelFavoriteBtn);
    await expect(unfavoriteBtn).toBeVisible({ timeout: 4_000 });
    await unfavoriteBtn.click();
    await expect(page.getByTestId(testIds.sidebarFavoritesSection)).not.toBeVisible({
      timeout: 8_000,
    });
  });
});
