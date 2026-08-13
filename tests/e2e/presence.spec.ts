/**
 * Presence feature — e2e coverage.
 *
 * Backend stub: InMemoryPresenceService (APP_ENV=test, no Redis).
 * The stub starts with no live[] entries — all users are offline until
 * PresenceTrackingListener calls touch() via kernel.request piggyback.
 * After the page loads (several API requests), the current user's liveness
 * key is set and the backend counts them online.
 *
 * Manual status setting is client-optimistic: selecting Away / DND /
 * Invisible updates the TanStack cache immediately so the UI reflects the
 * new state without waiting for a Mercure event.
 */
import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { T } from "./fixtures";

async function openProfileMenu(page: import("@playwright/test").Page) {
  await page.getByTestId(testIds.profileMenuButton).click();
  await expect(page.getByTestId(testIds.profileMenu)).toBeVisible({ timeout: T(6_000) });
}

/**
 * Expand the collapsed status section and click a specific status option.
 * Waits for the menu to collapse back (single-item mode) before returning.
 */
async function selectStatus(
  page: import("@playwright/test").Page,
  key: "online" | "away" | "dnd" | "invisible",
) {
  await page.getByTestId(testIds.statusCurrent).click();
  await page.getByTestId(`status-option-${key}`).click();
  await expect(page.getByTestId(testIds.statusCurrent)).toBeVisible({ timeout: T(4_000) });
}

test.describe.serial("Presence — self status dot", () => {
  test("self avatar shows a presence-dot defaulting to online", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    // The profile button wraps an Avatar that is given the current user's id,
    // so it renders a PresenceDot driven by the presence cache.
    // useMyPresence initialData is "online", so the dot is visible immediately.
    const profileBtn = page.getByTestId(testIds.profileMenuButton);
    await expect(profileBtn).toBeVisible({ timeout: T(8_000) });

    const dot = profileBtn.getByTestId(testIds.presenceDot);
    await expect(dot).toBeVisible({ timeout: T(6_000) });

    await expect(dot).toHaveAttribute("data-state", "online");
  });
});

test.describe.serial("Presence — status menu", () => {
  test("set status to Away — self dot and status button reflect Away", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await openProfileMenu(page);

    // The collapsed status button should start on online (initialData)
    const currentBtn = page.getByTestId(testIds.statusCurrent);
    await expect(currentBtn).toBeVisible({ timeout: T(4_000) });
    await expect(currentBtn).toHaveAttribute("data-state", "online");

    await selectStatus(page, "away");

    await expect(page.getByTestId(testIds.statusCurrent)).toHaveAttribute("data-state", "away");

    const dot = page.getByTestId(testIds.profileMenuButton).getByTestId(testIds.presenceDot);
    await expect(dot).toHaveAttribute("data-state", "away");

    // --- restore Online so the worker world is clean for later tests ---
    await selectStatus(page, "online");
    await expect(page.getByTestId(testIds.statusCurrent)).toHaveAttribute("data-state", "online");
  });

  test("set status to DND — menu reflects Do not disturb; then back to Online", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await openProfileMenu(page);
    await selectStatus(page, "dnd");

    await expect(page.getByTestId(testIds.statusCurrent)).toHaveAttribute("data-state", "dnd");

    const dot = page.getByTestId(testIds.profileMenuButton).getByTestId(testIds.presenceDot);
    await expect(dot).toHaveAttribute("data-state", "dnd");

    // Restore
    await selectStatus(page, "online");
    await expect(page.getByTestId(testIds.statusCurrent)).toHaveAttribute("data-state", "online");
  });

  test("set status to Invisible — menu reflects offline/invisible; then restore", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await openProfileMenu(page);
    await selectStatus(page, "invisible");

    // Invisible maps to the "offline" PresenceState
    await expect(page.getByTestId(testIds.statusCurrent)).toHaveAttribute("data-state", "offline");

    // Restore
    await selectStatus(page, "online");
    await expect(page.getByTestId(testIds.statusCurrent)).toHaveAttribute("data-state", "online");
  });
});

test.describe.serial("Presence — community online badge", () => {
  test("online badge appears after page load and opens the online panel on click", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    // The CommunityOnlineBadge only renders when onlineCount > 0.
    // PresenceTrackingListener piggybacks on kernel.request and calls touch()
    // for each authenticated request, so the current user becomes "live" in the
    // InMemory stub after at least one API call during page load.
    // Poll up to 10s to allow the 30s-interval query to fire (or the first load).
    const badge = page.getByTestId(testIds.communityOnlineBadge);
    await expect(badge).toBeVisible({ timeout: T(10_000) });

    const countText = await badge.textContent();
    const count = parseInt(countText?.trim() ?? "0", 10);
    expect(count).toBeGreaterThan(0);

    await badge.click();
    const panel = page.getByTestId(testIds.communityOnlinePanel);
    await expect(panel).toBeVisible({ timeout: T(4_000) });

    // The panel renders a header and either a user row or "No one is online"
    // The current user made requests so they are live; assert the panel
    // contains the user's display name (or at minimum something in the list area).
    await expect(panel).toContainText(world.userName, { timeout: T(4_000) });

    await badge.click();
    await expect(panel).not.toBeVisible({ timeout: T(4_000) });
  });
});
