import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";

/**
 * Admin shell responsiveness at a phone viewport (390px). Below the `md`
 * (768px) breakpoint the shell stacks vertically: the `w-60` sidebar becomes a
 * full-width top bar whose nav row scrolls horizontally, and the main content
 * pane drops to reduced padding. Desktop (Playwright's default 1280px) keeps
 * the static two-column layout and is covered by `admin.spec.ts`.
 *
 * The shell must be reached via the profile menu (not a cold hard-nav to
 * /admin) so auth is hydrated before the route guard runs — see admin.spec.ts.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function openAdminShell(page: import("@playwright/test").Page, communityId: string) {
  await page.goto(`/${communityId}`);
  // Mobile: open the nav drawer to reach the profile button, which lives on the rail.
  await page.getByTestId(testIds.mobileNavToggle).click();
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByTestId(testIds.adminPanelMenuEntry).click();
  await expect(page.getByTestId(testIds.adminShell)).toBeVisible({ timeout: 8_000 });
}

test.describe.serial("Admin shell — mobile (390px)", () => {
  test("nav links stay reachable in the horizontal top bar", async ({ adminPage: page, world }) => {
    await openAdminShell(page, world.communityId);

    // The first nav link is within the viewport (top bar, not off-canvas).
    await expect(page.locator(`aside a[href="/admin/users"]`)).toBeInViewport();
    // Every section is present (scrolled into the horizontal nav as needed).
    for (const seg of ["users", "communities", "settings", "health", "webhooks", "audit"]) {
      await expect(page.locator(`aside a[href="/admin/${seg}"]`)).toBeVisible({ timeout: 6_000 });
    }
  });

  test("the page does not overflow horizontally", async ({ adminPage: page, world }) => {
    await openAdminShell(page, world.communityId);

    // No horizontal scroll on the document: scrollWidth must fit the viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("tapping a nav link navigates to that section", async ({ adminPage: page, world }) => {
    await openAdminShell(page, world.communityId);

    await page.locator(`aside a[href="/admin/health"]`).click();
    await expect(page).toHaveURL(/\/admin\/health/, { timeout: 8_000 });
  });
});
