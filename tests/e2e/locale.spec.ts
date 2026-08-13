/**
 * Locale tests — verify that the client sends the correct Accept-Language header
 * based on the user's preference (localStorage `tyto_language`) or browser locale,
 * and that backend error messages are displayed in the negotiated language.
 */
import { request } from "@playwright/test";
import { test, expect } from "./worldFixtures";
import { E2E_API_URL, T } from "./fixtures";
import { testIds } from "./testIds";

async function openPreferencesModal(page: import("@playwright/test").Page) {
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(6_000) });
}

test.describe.serial("Accept-Language header", () => {
  test("header matches tyto_language preference (pl)", async ({ page, world }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tyto_language", "pl");
    });

    const capturedLocales: string[] = [];
    await page.route("**/api/**", (route) => {
      // Skip server-info — it's fetched via raw fetch() before apiClient is
      // configured and carries the browser's default Accept-Language, not ours.
      if (!route.request().url().includes("server-info")) {
        const lang = route.request().headers()["accept-language"];
        if (lang) capturedLocales.push(lang);
      }
      void route.fallback();
    });

    await page.goto(`/${world.communityId}`);
    await expect(page.locator("nav").first()).toBeVisible({ timeout: T(10_000) });

    // At least one apiClient call (e.g. communities) must carry Accept-Language: pl
    expect(capturedLocales).toContain("pl");
  });

  test("header falls back to browser locale when no preference is stored", async ({
    page,
    world,
  }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("tyto_language");
    });

    const capturedLocales: string[] = [];
    await page.route("**/api/**", (route) => {
      if (!route.request().url().includes("server-info")) {
        const lang = route.request().headers()["accept-language"];
        if (lang) capturedLocales.push(lang);
      }
      void route.fallback();
    });

    await page.goto(`/${world.communityId}`);
    await expect(page.locator("nav").first()).toBeVisible({ timeout: T(10_000) });

    // Some Accept-Language value must be sent; exact value depends on browser locale
    expect(capturedLocales.length).toBeGreaterThan(0);
    expect(capturedLocales[0]).toBeTruthy();
  });
});

test.describe.serial("Polish backend error messages", () => {
  /**
   * Register with an existing email so the backend fires the EmailAvailable
   * validator constraint and returns the violation message in Polish.
   *
   * In the test environment APP_VALIDATE_EMAILS=false, so:
   *  - Step 1 (create challenge) succeeds for any email, including existing ones.
   *  - Step 2 (register) runs the EmailAvailable constraint and returns 422.
   */
  test("registration with existing email shows Polish validator error", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tyto_language", "pl");
    });

    await page.goto("/register");

    // Step 1: submit existing email — challenge is created regardless (email validation disabled)
    await page.locator("#email").fill("admin@tyto.test");
    await page.locator('button[type="submit"]').click();

    // Step 2 form appears (display name input)
    await expect(page.locator("#displayName")).toBeVisible({ timeout: T(8_000) });

    await page.locator("#displayName").fill("Test User");
    await page.locator("#code").fill("000000");
    await page.locator("#password").fill("testpassword123");
    await page.locator("#confirmPassword").fill("testpassword123");
    await page.locator('button[type="submit"]').click();

    // Polish EmailAvailable violation from the backend
    await expect(page.getByText("Ten adres e-mail jest już zarejestrowany.")).toBeVisible({
      timeout: T(8_000),
    });
  });

  test("registration with existing email shows English error when locale is English", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tyto_language", "en");
    });

    await page.goto("/register");

    await page.locator("#email").fill("admin@tyto.test");
    await page.locator('button[type="submit"]').click();

    await expect(page.locator("#displayName")).toBeVisible({ timeout: T(8_000) });

    await page.locator("#displayName").fill("Test User");
    await page.locator("#code").fill("000000");
    await page.locator("#password").fill("testpassword123");
    await page.locator("#confirmPassword").fill("testpassword123");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText("This email address is already registered.")).toBeVisible({
      timeout: T(8_000),
    });
  });
});

test.describe.serial("Language switcher → header update", () => {
  // Locale persists server-side; context teardown does not undo it. Restore or
  // later same-worker cadmin tests render in Polish and fail English assertions.
  test.afterAll(async ({ world }) => {
    const ctx = await request.newContext({ ignoreHTTPSErrors: true });
    await ctx.patch(`${E2E_API_URL}/api/v1/me/preferences`, {
      headers: {
        Authorization: `Bearer ${world.cadminJwt}`,
        "Content-Type": "application/merge-patch+json",
      },
      data: { locale: null },
    });
    await ctx.dispose();
  });

  test("switching to Polish in Preferences makes subsequent API calls use pl", async ({
    cadminPage: page,
    world,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tyto_language", "en");
    });

    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openPreferencesModal(page);
    const modal = page.getByRole("dialog");
    await modal.getByTestId(testIds.prefTabGeneral).click();
    await modal.getByTestId(testIds.langPl).click();
    await expect(modal.getByTestId(testIds.langPl)).toHaveClass(/bg-accent-gradient/);
    await modal.getByRole("button", { name: "Zamknij" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });

    // Capture locale on the next API call
    let capturedLocale: string | null = null;
    await page.route("**/api/**", (route) => {
      capturedLocale ??= route.request().headers()["accept-language"] ?? null;
      void route.fallback();
    });

    // Client-side navigation (click a channel link) so addInitScript does NOT
    // re-run and reset the locale back to "en".
    await page.locator("aside").getByRole("link", { name: world.textChannelId }).first().click();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });

    expect(capturedLocale).toBe("pl");
  });
});
