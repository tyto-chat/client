/**
 * Two-factor authentication (TOTP) — enrollment, sign-in, recovery, teardown.
 *
 * Codes are generated locally from the secret the wizard displays (see totp.ts,
 * RFC 6238 over node:crypto) — no authenticator app and no npm dependency.
 *
 * Every account here is a throwaway created in beforeAll: leaving 2FA enabled on
 * a world fixture account would break every later spec that signs in as it.
 * `enrollee` walks the UI wizard and is disabled again at the end; `victim` is
 * enrolled through the API so the admin force-disable path has a target.
 *
 * Not covered: the per-user 2FA rate limiter (5/15min). The limiter's cache is
 * an array adapter in the test environment, so it cannot be exercised over HTTP.
 */

import { test, expect } from "./worldFixtures";
import { authedPage } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { LoginPage } from "../pages/LoginPage";
import { testIds } from "./testIds";
import { totp } from "./totp";
import type { Page } from "@playwright/test";

const PASSWORD = "e2e-password";

let enrollee: { jwt: string; name: string; email: string };
let victim: { jwt: string; name: string; email: string };
let secret = "";
let recoveryCodes: string[] = [];

/**
 * A code for the NEXT 30-second step. `verifyLogin` rejects any timestep at or
 * below `totpLastUsedTimestep`, so the code enrollment just consumed cannot sign
 * in — and the two happen seconds apart. The server's ±29s leeway accepts the
 * next step immediately, which beats sleeping out the current one.
 */
function nextStepCode(): string {
  return totp(secret, Date.now() + 30_000);
}

async function openSecurityPanel(page: Page): Promise<void> {
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(6_000) });
  await page.getByTestId(testIds.prefTabAccount).click();
}

test.describe.serial("Two-factor authentication", () => {
  test.beforeAll(async ({ world }) => {
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      enrollee = await wb.createMember(world.communityId, "TwoFA Enrollee");
      victim = await wb.createMember(world.communityId, "TwoFA Victim");
    } finally {
      await wb.dispose();
    }

    const asVictim = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, victim.jwt);
    await asVictim.init();
    try {
      await asVictim.enableTwoFactor();
    } finally {
      await asVictim.dispose();
    }
  });

  test("enrollment wizard: secret → code → recovery codes → enabled", async ({
    browser,
    world,
  }) => {
    const page = await authedPage(browser, enrollee.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await openSecurityPanel(page);

      await page.getByTestId(testIds.twoFactorEnable).click();

      const secretEl = page.getByTestId(testIds.twoFactorSecret);
      await expect(secretEl).toBeVisible({ timeout: T(8_000) });
      secret = ((await secretEl.textContent()) ?? "").trim();
      expect(secret.length).toBeGreaterThan(0);

      await page.getByTestId(testIds.twoFactorSetupNext).click();
      await page.getByTestId(testIds.twoFactorSetupCode).fill(totp(secret));
      await page.getByRole("button", { name: "Turn on" }).click();

      const codeCells = page.getByTestId(testIds.recoveryCode);
      await expect(codeCells.first()).toBeVisible({ timeout: T(8_000) });
      recoveryCodes = await codeCells.allInnerTexts();
      expect(recoveryCodes).toHaveLength(10);

      await page.getByTestId(testIds.twoFactorCodesSaved).click();

      await expect(page.getByTestId(testIds.twoFactorDisable)).toBeVisible({ timeout: T(8_000) });
      await expect(page.getByTestId(testIds.twoFactorEnable)).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });

  test("sign-in asks for a code and accepts the authenticator code", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(enrollee.email, PASSWORD);

    const codeInput = page.getByTestId(testIds.twoFactorCodeInput);
    await expect(codeInput).toBeVisible({ timeout: T(10_000) });

    // Filling the sixth digit auto-submits the form.
    await codeInput.fill(nextStepCode());

    await login.expectRedirectedAway();
    await expect(page.getByTestId(testIds.profileMenuButton)).toBeVisible({ timeout: T(10_000) });
  });

  test("a wrong code is rejected, then a recovery code signs in", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(enrollee.email, PASSWORD);

    const codeInput = page.getByTestId(testIds.twoFactorCodeInput);
    await expect(codeInput).toBeVisible({ timeout: T(10_000) });

    await codeInput.fill("000000");
    await expect(page.getByText("That code is not valid. Try again.")).toBeVisible({
      timeout: T(10_000),
    });
    await expect(page).toHaveURL(/\/login/);

    await page.getByRole("button", { name: "Use a recovery code instead" }).click();
    await codeInput.fill(recoveryCodes[0]!);
    await page.getByRole("button", { name: "Verify" }).click();

    await login.expectRedirectedAway();
    await expect(page.getByTestId(testIds.profileMenuButton)).toBeVisible({ timeout: T(10_000) });
  });

  test("a spent recovery code cannot be reused", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(enrollee.email, PASSWORD);

    const codeInput = page.getByTestId(testIds.twoFactorCodeInput);
    await expect(codeInput).toBeVisible({ timeout: T(10_000) });

    await page.getByRole("button", { name: "Use a recovery code instead" }).click();
    await codeInput.fill(recoveryCodes[0]!);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByText("That code is not valid. Try again.")).toBeVisible({
      timeout: T(10_000),
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("disabling with the current password turns 2FA back off", async ({ browser, world }) => {
    const page = await authedPage(browser, enrollee.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await openSecurityPanel(page);

      await page.getByTestId(testIds.twoFactorDisable).click();
      await page.getByLabel("Current password").fill(PASSWORD);
      await page.getByTestId(testIds.twoFactorActionSubmit).click();

      await expect(page.getByTestId(testIds.twoFactorEnable)).toBeVisible({ timeout: T(8_000) });
      await expect(page.getByTestId(testIds.twoFactorDisable)).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });

  test("global admin can force-disable a locked-out user's 2FA", async ({ adminPage: page }) => {
    await page.goto("/admin/users");

    await page.getByPlaceholder("name or email").fill(victim.email);
    const row = page.getByRole("row").filter({ hasText: victim.email });
    await expect(row).toBeVisible({ timeout: T(10_000) });
    await row.click();

    const forceDisable = page.getByTestId(testIds.adminDisableTwoFactor);
    await expect(forceDisable).toBeVisible({ timeout: T(8_000) });
    await forceDisable.click();
    await page.getByTestId(testIds.confirmDialogConfirm).click();

    await expect(forceDisable).toHaveCount(0, { timeout: T(8_000) });
  });
});
