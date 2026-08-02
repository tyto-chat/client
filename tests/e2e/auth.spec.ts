import { test, expect } from "./worldFixtures";
import { setupServerInfoRoute } from "./fixtures";
import { LoginPage } from "../pages/LoginPage";
import { testIds } from "./testIds";

// Auth tests run without a pre-authenticated state (base `page` fixture)
test.describe.serial("Authentication", () => {
  test("anonymous user lands on community view, not /login", async ({ page }) => {
    await page.goto("/");
    // The app redirects anonymous users to the first public community, not /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 8_000 });
    await expect(page).toHaveURL(/\/[a-z0-9-]+\/[a-z0-9-]+/, { timeout: 8_000 });
  });

  test("login with valid credentials redirects to app", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("admin@tyto.test", "e2e-password");
    await loginPage.expectRedirectedAway();
  });

  test("login with wrong password shows error", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("admin@tyto.test", "wrong-password");
    await loginPage.expectError();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with unknown email shows error", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("nobody@tyto.test", "e2e-password");
    await loginPage.expectError();
  });

  test("a present token redirects away from /login (beforeLoad guard)", async ({
    browser,
    world,
  }) => {
    // A real, backend-accepted JWT seeded before boot: the /login beforeLoad
    // guard sees a token and redirects away, and fetchMe succeeds so the token
    // is not cleared out from under the assertion.
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await setupServerInfoRoute(ctx);
    await ctx.addInitScript((token) => {
      (window as unknown as { __TYTO_DEV_TOKEN__?: string }).__TYTO_DEV_TOKEN__ = token;
    }, world.adminJwt);
    const page = await ctx.newPage();
    try {
      await page.goto("/login");
      await new LoginPage(page).expectRedirectedAway();
    } finally {
      await ctx.close();
    }
  });
});

test.describe.serial("Registration form", () => {
  test("step 2 shows display name field", async ({ page }) => {
    await page.goto("/register");
    await page.locator("#email").fill("new-user@tyto.test");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#displayName")).toBeVisible({ timeout: 8_000 });
  });

  test("display name under 4 characters shows validation error", async ({ page }) => {
    await page.goto("/register");
    await page.locator("#email").fill("new-user@tyto.test");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#displayName")).toBeVisible({ timeout: 8_000 });
    await page.locator("#displayName").fill("Abc");
    await page.locator("#displayName").blur();
    await expect(page.getByText("Display name must be at least 4 characters.")).toBeVisible();
  });

  test("display name 4+ characters clears error", async ({ page }) => {
    await page.goto("/register");
    await page.locator("#email").fill("new-user@tyto.test");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#displayName")).toBeVisible({ timeout: 8_000 });
    await page.locator("#displayName").fill("Abc");
    await page.locator("#displayName").blur();
    await expect(page.getByText("Display name must be at least 4 characters.")).toBeVisible();
    await page.locator("#displayName").fill("Abcd");
    await expect(page.getByText("Display name must be at least 4 characters.")).toBeHidden();
  });
});

// Tests that rely on a pre-authenticated admin session
test.describe.serial("Authenticated session", () => {
  test("app shell is visible after login", async ({ adminPage: page }) => {
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("logout clears session and shows login modal", async ({ adminPage: page }) => {
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 10_000 });
    // The profile button's title is the user's display name ("Admin User" in E2E fixtures)
    await page.getByTestId(testIds.profileMenuButton).click();
    // First click shows "Sign Out"; second click (confirmation) finalises logout
    await page
      .getByRole("button", { name: /sign out/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    // After logout the login modal opens over the app shell
    await expect(page.locator("#email")).toBeVisible({ timeout: 8_000 });
  });
});
