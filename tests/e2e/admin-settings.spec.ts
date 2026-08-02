/**
 * Admin settings — values actually persist, and user provisioning works.
 *
 * `admin.spec.ts` covers who may reach /admin and that the nav renders; nothing
 * covered a setting surviving a save. These are the settings-registry round
 * trips: edit → save → reload → still there.
 *
 * Every field touched here is restored to its original value in the same test.
 * The settings table is server-global — a stray value leaks into every other
 * spec on the worker, so nothing may be left changed. Fields with wide blast
 * radius (server name, registration toggle) are deliberately avoided: the auth
 * and branding specs read them.
 */

import { test, expect } from "./worldFixtures";
import type { Page } from "@playwright/test";

const SAVE = "Save changes";
const SAVED_TOAST = "Settings saved.";

async function gotoSettingsTab(page: Page, tab: string): Promise<void> {
  await page.goto(`/admin/settings?tab=${tab}`);
  await expect(page.getByRole("button", { name: SAVE })).toBeVisible({ timeout: 10_000 });
}

test.describe.serial("Admin settings", () => {
  test("a numeric setting survives save and reload", async ({ adminPage: page }) => {
    await gotoSettingsTab(page, "general");

    const field = page.getByLabel("Message retention (days)");
    const original = await field.inputValue();
    const changed = String(Number(original || "0") + 7);

    await field.fill(changed);
    await page.getByRole("button", { name: SAVE }).click();
    await expect(page.getByText(SAVED_TOAST)).toBeVisible({ timeout: 8_000 });

    await gotoSettingsTab(page, "general");
    await expect(page.getByLabel("Message retention (days)")).toHaveValue(changed);

    await page.getByLabel("Message retention (days)").fill(original);
    await page.getByRole("button", { name: SAVE }).click();
    await expect(page.getByText(SAVED_TOAST)).toBeVisible({ timeout: 8_000 });
  });

  test("a toggle survives save and reload", async ({ adminPage: page }) => {
    await gotoSettingsTab(page, "general");

    const toggle = page.getByRole("switch", { name: "List in tyto server catalogue" });
    await expect(toggle).toBeVisible({ timeout: 8_000 });
    const wasOn = (await toggle.getAttribute("aria-checked")) === "true";

    await toggle.click();
    await page.getByRole("button", { name: SAVE }).click();
    await expect(page.getByText(SAVED_TOAST)).toBeVisible({ timeout: 8_000 });

    await gotoSettingsTab(page, "general");
    const reloaded = page.getByRole("switch", { name: "List in tyto server catalogue" });
    await expect(reloaded).toHaveAttribute("aria-checked", String(!wasOn));

    await reloaded.click();
    await page.getByRole("button", { name: SAVE }).click();
    await expect(page.getByText(SAVED_TOAST)).toBeVisible({ timeout: 8_000 });
  });

  test("the save button stays disabled until something changes", async ({ adminPage: page }) => {
    await gotoSettingsTab(page, "general");

    await expect(page.getByRole("button", { name: SAVE })).toBeDisabled();

    const field = page.getByLabel("Message retention (days)");
    const original = await field.inputValue();
    await field.fill(String(Number(original || "0") + 1));
    await expect(page.getByRole("button", { name: SAVE })).toBeEnabled();

    await field.fill(original);
  });

  test("admin provisions a new account and it appears in the user list", async ({
    adminPage: page,
  }) => {
    const stamp = String(Date.now()).slice(-8);
    const name = `Provisioned ${stamp}`;
    const email = `provisioned-${stamp}@tyto.test`;

    await page.goto("/admin/users");
    await page.getByRole("button", { name: "New user" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Create & invite" }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("name or email").fill(email);
    await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible({ timeout: 10_000 });
  });
});
