import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { T } from "./fixtures";

/**
 * M5 — modal + popover mobile responsiveness at a phone viewport (390×844).
 *
 * Checks that the SearchDialog is visible and within the viewport, and that
 * the PinnedMessages modal is visible (opened via the mobile overflow menu).
 * Desktop behaviour is covered by the rest of the suite (default 1280×720).
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe.serial("M5 mobile modals (390px)", () => {
  test("SearchDialog opens via mobile-search-open-btn and fits the viewport", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}/${world.textChannelId}`);
    await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

    await page.getByTestId(testIds.mobileSearchOpenBtn).click();

    const dialog = page.getByTestId(testIds.searchDialog);
    await expect(dialog).toBeVisible({ timeout: T(5_000) });

    await expect(dialog).toBeInViewport();

    // Bounding box should fit within the 390px wide viewport.
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    await expect(page.getByTestId(testIds.searchInput)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: T(3_000) });
  });

  test("PinnedMessages modal opens via overflow menu and fits the viewport", async ({
    adminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}/${world.textChannelId}`);
    await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

    await page.getByTestId(testIds.mobileActionMenuBtn).click();

    await page
      .getByRole("button", { name: /Pinned/i })
      .first()
      .click();

    const modal = page.getByTestId(testIds.pinnedMessagesModal);
    await expect(modal).toBeVisible({ timeout: T(8_000) });

    // The modal's scroll container should be within the viewport horizontally.
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test("Preferences modal fills the screen, not squished into the rail", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}/${world.textChannelId}`);
    await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

    // The profile button lives in the community rail — open the mobile drawer.
    await page.getByTestId(testIds.mobileNavToggle).click();
    await page.getByTestId(testIds.profileMenuButton).click();
    await page.getByRole("button", { name: "Preferences" }).click();

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: T(8_000) });

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    // The portal makes it viewport-wide; before the fix it was confined to
    // the ~72px rail. A generous floor guards that regression.
    expect(box!.width).toBeGreaterThan(300);
  });
});

// Voice pre-join is a full-view panel (not a Modal). On a short viewport its
// content can overflow — the Join button must stay reachable via a pinned
// footer rather than scrolling off-screen.
test.describe.serial("M5 voice pre-join (short viewport 390×600)", () => {
  test.use({ viewport: { width: 390, height: 600 } });

  test("Join button stays in the viewport on a short screen", async ({ userPage: page, world }) => {
    await page.goto(`/${world.communityId}/${world.audioChannelId}`);
    await expect(page.getByTestId(testIds.mobileNavToggle)).toBeVisible({ timeout: T(15_000) });

    const joinBtn = page.getByRole("button", { name: /join/i }).last();
    await expect(joinBtn).toBeVisible({ timeout: T(10_000) });
    await expect(joinBtn).toBeInViewport();
  });
});
