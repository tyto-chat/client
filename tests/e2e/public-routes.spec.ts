import { test, expect } from "./worldFixtures";
import { T } from "./fixtures";

/**
 * Public/parameterised routes with no prior coverage: the invite landing
 * page (negative: bogus token) and the reset-password form (negative:
 * validation gates). Both are reachable states any real deployment hits.
 */
test.describe.serial("Invite landing page", () => {
  test("signed-in user with a bogus token sees the invalid-invite state", async ({
    userPage: page,
  }) => {
    await page.goto("/invite/bogus-token-that-does-not-exist");
    await expect(page.getByText(/invite unavailable/i)).toBeVisible({ timeout: T(15_000) });
  });

  test("anonymous visitor with a bogus token also gets a non-crashing page", async ({ page }) => {
    await page.goto("/invite/bogus-token-that-does-not-exist");
    await expect(page.getByText(/invite unavailable|sign in to accept/i).first()).toBeVisible({
      timeout: T(15_000),
    });
  });
});

test.describe.serial("Reset password page", () => {
  test("renders the request form for an anonymous visitor", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.locator("input[type='email']").first()).toBeVisible({ timeout: T(15_000) });
  });

  test("confirm step blocks submit on a password mismatch", async ({ page }) => {
    await page.goto("/reset-password");

    // The request endpoint is enumeration-safe (200 for any address) and the
    // test env mailer is a null transport, so this only advances the UI.
    await page.locator("input[type='email']").first().fill("someone@example.com");
    await page.getByRole("button", { name: /send/i }).click();

    const tokenInput = page.locator("#token");
    await expect(tokenInput).toBeVisible({ timeout: T(15_000) });

    await tokenInput.fill("some-token");
    await page.locator("#password").fill("longenough1");
    await page.locator("#confirmPassword").fill("different1");
    await page.locator("#confirmPassword").blur();

    await expect(page.getByText(/match/i)).toBeVisible({ timeout: T(5_000) });
    await expect(page.locator("button[type='submit']")).toBeDisabled();
  });
});
