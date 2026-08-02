import { test, expect } from "./worldFixtures";
import { MobilePage } from "../pages/MobilePage";
import { testIds } from "./testIds";

/**
 * M1 mobile shell-drawer behaviour at a phone viewport. The community rail
 * (in `_app.tsx`) + the per-route channel sidebar slide in together as one
 * off-canvas drawer below the `md` (768px) breakpoint. Desktop (Playwright's
 * default 1280px) is covered by the rest of the suite, which still sees static
 * columns.
 *
 * Off-canvas elements stay in the DOM (translated out of view), so visibility
 * is asserted with `toBeInViewport()` rather than `toBeVisible()`.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe.serial("Mobile nav drawer (390px)", () => {
  test("channel sidebar is off-canvas by default", async ({ userPage: page, world }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    // The hamburger toggle is the only nav affordance on mobile.
    await expect(page.getByTestId(testIds.mobileNavToggle)).toBeInViewport();

    // The channel sidebar (the <aside> holding channel links) is translated
    // off-screen, so its channel links are not within the viewport.
    const sidebarLink = page.locator("aside a").first();
    await expect(sidebarLink).not.toBeInViewport();

    await expect(page.getByTestId(testIds.mobileNavScrim)).toHaveCount(0);
  });

  test("hamburger opens the drawer (rail + sidebar visible)", async ({ userPage: page, world }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.mobileNavToggle).click();

    await expect(page.getByTestId(testIds.mobileNavScrim)).toBeInViewport();
    // Rail (community nav) — first <nav>.
    await expect(page.locator("nav").first()).toBeInViewport();
    await expect(page.locator("aside a").first()).toBeInViewport();
  });

  test("tapping a channel link navigates and auto-closes the drawer", async ({
    userPage: page,
    world,
  }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.mobileNavToggle).click();
    await expect(page.getByTestId(testIds.mobileNavScrim)).toBeInViewport();

    // Tap the channel link inside the drawer (the audio channel, so the URL
    // changes from the current text channel).
    await page.locator("aside a").filter({ hasText: world.audioChannelId }).first().click();

    await expect(page).toHaveURL(new RegExp(world.audioChannelId), { timeout: 8_000 });
    // Route change auto-closes the drawer.
    await expect(page.getByTestId(testIds.mobileNavScrim)).toHaveCount(0);
    await expect(page.locator("aside a").first()).not.toBeInViewport();
  });

  // Regression: empty-state routes (DM index, channel-less community index)
  // previously rendered a bare <main> with no MobileTopBar, so the hamburger
  // was absent and the user got trapped with no way to reach the nav drawer.
  test("DM empty state shows the hamburger (no conversation selected)", async ({
    userPage: page,
  }) => {
    await page.goto(`/dm`);
    await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(testIds.mobileNavToggle)).toBeInViewport();

    await page.getByTestId(testIds.mobileNavToggle).click();
    await expect(page.getByTestId(testIds.mobileNavScrim)).toBeInViewport();
  });

  test("clicking the scrim closes the drawer", async ({ userPage: page, world }) => {
    const mobile = new MobilePage(page, world.communityId);
    await mobile.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.mobileNavToggle).click();
    const scrim = page.getByTestId(testIds.mobileNavScrim);
    await expect(scrim).toBeInViewport();

    // Click the scrim in the area NOT covered by the drawer (the drawer occupies
    // the left ~352px: 64px rail + up to 288px sidebar), so tap near the right edge.
    await scrim.click({ position: { x: 380, y: 400 } });

    await expect(scrim).toHaveCount(0);
    await expect(page.locator("aside a").first()).not.toBeInViewport();
  });
});
