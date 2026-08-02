import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";

/**
 * Admin Shell access control (ROLE_PERMISSIONS.md § Admin Shell).
 *
 * The `/admin` surface is GLOBAL-ADMIN ONLY — there is no community-admin / mod
 * / user surface in it at all. Two UI boundaries are tested here:
 *   1. The profile-menu "Admin panel" entry (rendered only when isAdmin).
 *   2. The `/admin` route guard (`beforeLoad` redirects non-admins to `/`).
 *
 * Principals: global admin (adminPage), community admin (cadminPage — community
 * role, NOT ROLE_ADMIN), regular user (userPage), anonymous (base `page`).
 */
test.describe.serial("Admin shell — menu entry visibility", () => {
  test("regular user does not see the admin-panel menu entry", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId(testIds.profileMenuButton).click();
    // Menu is open (a known entry renders) but the admin entry is absent.
    await expect(page.getByTestId(testIds.profileMenu)).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId(testIds.adminPanelMenuEntry)).toHaveCount(0);
  });

  test("community admin does not see the admin-panel menu entry", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId(testIds.profileMenuButton).click();
    await expect(page.getByTestId(testIds.profileMenu)).toBeVisible({ timeout: 6_000 });
    // Community admin is a community-scoped role, not ROLE_ADMIN — no admin shell.
    await expect(page.getByTestId(testIds.adminPanelMenuEntry)).toHaveCount(0);
  });

  test("global admin sees the admin-panel menu entry and it opens the shell", async ({
    adminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId(testIds.profileMenuButton).click();
    const entry = page.getByTestId(testIds.adminPanelMenuEntry);
    await expect(entry).toBeVisible({ timeout: 6_000 });

    await entry.click();
    // `/admin` (no child) redirects to the users tab.
    await expect(page).toHaveURL(/\/admin\/users/, { timeout: 8_000 });
    await expect(page.getByTestId(testIds.adminShell)).toBeVisible({ timeout: 8_000 });
  });
});

test.describe.serial("Admin shell — route guard", () => {
  test("regular user navigating to /admin is redirected away", async ({ userPage: page }) => {
    await page.goto("/admin");
    // Guard redirects to "/" → the app shell (community), never the admin shell.
    await expect(page.getByTestId(testIds.adminShell)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin(\/|$)/);
  });

  test("community admin navigating to /admin is redirected away", async ({ cadminPage: page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId(testIds.adminShell)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin(\/|$)/);
  });

  test("anonymous visitor navigating to /admin is redirected away", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId(testIds.adminShell)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin(\/|$)/);
  });
});

test.describe.serial("Admin shell — global admin surface", () => {
  test("global admin sees every admin section nav link", async ({ adminPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });
    await page.getByTestId(testIds.profileMenuButton).click();
    await page.getByTestId(testIds.adminPanelMenuEntry).click();
    await expect(page.getByTestId(testIds.adminShell)).toBeVisible({ timeout: 8_000 });

    // Assert by href (i18n-stable) rather than the localized nav labels.
    for (const seg of ["users", "communities", "settings", "health", "webhooks", "audit"]) {
      await expect(page.locator(`aside a[href="/admin/${seg}"]`)).toBeVisible({ timeout: 6_000 });
    }
  });

  // A cold load has a token but no hydrated user yet, so the guard has to
  // resolve the roles itself or a refresh throws the admin out of /admin.
  test("global admin hard-loading an admin URL stays there", async ({ adminPage: page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByTestId(testIds.adminShell)).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/admin\/settings/);
  });
});
