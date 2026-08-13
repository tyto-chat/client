import { fileURLToPath } from "url";
import { testIds, voiceModeTestId } from "./testIds";
import path from "path";
import { test, expect } from "./worldFixtures";
import { T } from "./fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR1 = path.resolve(__dirname, "../fixtures/avatar1.jpg");

/**
 * Opens the user profile menu (bottom-left avatar button) and clicks "Edit Profile".
 * Returns once the Edit Profile modal is visible.
 */
async function openEditProfileModal(page: import("@playwright/test").Page) {
  // The profile button lives in the left nav; its title is the user's display name.
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(6_000) });
}

async function openPreferencesModal(page: import("@playwright/test").Page) {
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(6_000) });
}

async function clickModalTab(page: import("@playwright/test").Page, testId: string) {
  const dialog = page.getByRole("dialog").first();
  await dialog.getByTestId(testId).click();
}

// Change-password now lives under Preferences → Account tab (no longer a
// standalone item in the profile menu).
async function openChangePasswordModal(page: import("@playwright/test").Page) {
  await page.getByTestId(testIds.profileMenuButton).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: T(6_000) });
  await clickModalTab(page, testIds.prefTabAccount);
  await page.getByRole("button", { name: "Change Password" }).click();
  // The change-password modal opens on top of Preferences — it's the last dialog.
  await expect(page.getByRole("dialog").last()).toBeVisible({ timeout: T(6_000) });
}

test.describe.serial("User profile", () => {
  test("edit display name → nav button title updates", async ({ userPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openEditProfileModal(page);

    const modal = page.getByRole("dialog");
    const nameInput = modal.getByRole("textbox").first();
    await nameInput.fill("User Updated");
    await modal.getByRole("button", { name: /^save$/i }).click();

    await expect(modal).not.toBeVisible({ timeout: T(8_000) });

    await expect(page.locator("nav button[title='User Updated']")).toBeVisible({
      timeout: T(6_000),
    });

    // --- Restore original name so other tests are not affected ---
    await openEditProfileModal(page);
    await modal.getByRole("textbox").first().fill(world.userName);
    await modal.getByRole("button", { name: /^save$/i }).click();
    await expect(modal).not.toBeVisible({ timeout: T(8_000) });
  });

  test("Save button is disabled when name is unchanged", async ({ userPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openEditProfileModal(page);

    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("button", { name: /^save$/i })).toBeDisabled();

    await modal.getByRole("textbox").first().fill("New Name");
    await expect(modal.getByRole("button", { name: /^save$/i })).toBeEnabled();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });

  test("upload avatar → image appears; remove avatar → initials appear", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openEditProfileModal(page);
    const modal = page.getByRole("dialog");

    // Upload a pre-downloaded 512×512 JPEG fixture (within the 100–1000 px valid range)
    await modal.locator('input[type="file"]').setInputFiles(AVATAR1);

    await expect(page.getByText("Avatar updated.")).toBeVisible({ timeout: T(10_000) });
    await expect(modal.locator('img[alt="avatar"]')).toBeVisible({ timeout: T(6_000) });

    await expect(modal.getByRole("button", { name: "Remove avatar" })).toBeVisible();

    await modal.getByRole("button", { name: "Remove avatar" }).click();
    await expect(page.getByText("Avatar removed.")).toBeVisible({ timeout: T(8_000) });

    // Image should be gone; the initials fallback is rendered as text in the circle
    await expect(modal.locator('img[alt="avatar"]')).not.toBeVisible({ timeout: T(6_000) });
    await expect(modal.getByRole("button", { name: "Remove avatar" })).toBeHidden();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });

  test("avatar validation: image too small → error message", async ({ userPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openEditProfileModal(page);
    const modal = page.getByRole("dialog");

    // A valid 1×1 PNG (red pixel) — well below the 100×100 minimum required.
    const TINY_1X1_PNG_B64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==";
    const tinyBuffer = Buffer.from(TINY_1X1_PNG_B64, "base64");

    await modal.locator('input[type="file"]').setInputFiles({
      name: "tiny.png",
      mimeType: "image/png",
      buffer: tinyBuffer,
    });

    await expect(modal.getByText("Image must be at least 100×100 pixels.")).toBeVisible({
      timeout: T(6_000),
    });

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });
});

test.describe.serial("Preferences", () => {
  test("change interface scale → button reflects active state and localStorage updates", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openPreferencesModal(page);
    const modal = page.getByRole("dialog");

    await modal.getByRole("button", { name: "125%" }).click();

    // The 125% button should now have the active (indigo) class; others should not
    await expect(modal.getByRole("button", { name: "125%" })).toHaveClass(/bg-accent-gradient/);
    await expect(modal.getByRole("button", { name: "100%" })).not.toHaveClass(/bg-accent-gradient/);

    const stored = await page.evaluate(() => localStorage.getItem("fontSize"));
    expect(stored).toBe("125%");

    // Restore 100%
    await modal.getByRole("button", { name: "100%" }).click();
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });

  test("change send message key → persists after modal close/reopen", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openPreferencesModal(page);
    const modal = page.getByRole("dialog");
    await modal.getByTestId(testIds.prefTabChat).click();

    await modal.getByRole("button", { name: "Shift+Enter" }).click();
    await expect(modal.getByRole("button", { name: "Shift+Enter" })).toHaveClass(
      /bg-accent-gradient/,
    );

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });

    await openPreferencesModal(page);
    const modal2 = page.getByRole("dialog");
    await modal2.getByTestId(testIds.prefTabChat).click();
    await expect(modal2.getByRole("button", { name: "Shift+Enter" })).toHaveClass(
      /bg-accent-gradient/,
    );

    // Restore Enter
    await modal2.getByRole("button", { name: "Enter", exact: true }).click();
    await modal2.getByRole("button", { name: "Close" }).click();
    await expect(modal2).not.toBeVisible({ timeout: T(6_000) });
  });

  test("change timezone → dropdown shows selected value and localStorage updates", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openPreferencesModal(page);
    const modal = page.getByRole("dialog");
    await modal.getByTestId(testIds.prefTabGeneral).click();

    const tzSelect = modal.locator("select");
    await tzSelect.selectOption("America/New_York");
    await expect(tzSelect).toHaveValue("America/New_York");

    const stored = await page.evaluate(() => localStorage.getItem("timezone"));
    expect(stored).toBe("America/New_York");

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });

    await openPreferencesModal(page);
    const modal2 = page.getByRole("dialog");
    await modal2.getByTestId(testIds.prefTabGeneral).click();
    await expect(modal2.locator("select")).toHaveValue("America/New_York");

    // Restore browser default by clearing localStorage and closing
    await page.evaluate(() => localStorage.removeItem("timezone"));
    await modal2.getByRole("button", { name: "Close" }).click();
    await expect(modal2).not.toBeVisible({ timeout: T(6_000) });
  });

  test("switch voice mode to Push to Talk → PTT key bind section appears", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openPreferencesModal(page);
    const modal = page.getByRole("dialog");

    // Voice mode lives under the "Voice & Video" tab in the grouped nav.
    await modal.getByTestId(testIds.prefTabVoiceVideo).click();

    await modal.getByTestId(voiceModeTestId("ptt")).click();
    await expect(modal.getByTestId(voiceModeTestId("ptt"))).toHaveClass(/bg-accent-gradient/);

    await expect(modal.getByText("Push to talk key")).toBeVisible();

    await modal.getByTestId(voiceModeTestId("open")).click();
    await expect(modal.getByTestId(voiceModeTestId("open"))).toHaveClass(/bg-accent-gradient/);
    await expect(modal.getByText("Push to talk key")).toBeHidden();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });
});

test.describe.serial("Change password", () => {
  test("wrong current password → error message", async ({ userPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openChangePasswordModal(page);
    const modal = page.getByRole("dialog").last();

    await modal.getByLabel("Current password").fill("wrong-password");
    await modal.getByLabel("New password", { exact: true }).fill("newpassword123");
    await modal.getByLabel("Confirm new password").fill("newpassword123");

    await modal.getByRole("button", { name: "Change Password" }).click();

    await expect(modal.getByText(/failed to change password/i)).toBeVisible({ timeout: T(8_000) });

    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Current password")).not.toBeVisible({ timeout: T(6_000) });
  });

  test("new password too short → inline validation error", async ({ userPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openChangePasswordModal(page);
    const modal = page.getByRole("dialog").last();

    await modal.getByLabel("New password", { exact: true }).fill("short");
    // Trigger blur to show validation
    await modal.getByLabel("New password", { exact: true }).blur();

    await expect(modal.getByText("Password must be at least 8 characters.")).toBeVisible({
      timeout: T(6_000),
    });

    await expect(modal.getByRole("button", { name: "Change Password" })).toBeDisabled();

    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Current password")).not.toBeVisible({ timeout: T(6_000) });
  });

  test("password confirmation mismatch → inline validation error", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openChangePasswordModal(page);
    const modal = page.getByRole("dialog").last();

    await modal.getByLabel("New password", { exact: true }).fill("validpassword123");
    await modal.getByLabel("Confirm new password").fill("differentpassword");
    await modal.getByLabel("Confirm new password").blur();

    await expect(modal.getByText("Passwords do not match.")).toBeVisible({ timeout: T(6_000) });
    await expect(modal.getByRole("button", { name: "Change Password" })).toBeDisabled();

    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Current password")).not.toBeVisible({ timeout: T(6_000) });
  });

  test("correct current password → password changed and modal closes", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: T(8_000) });

    await openChangePasswordModal(page);
    const modal = page.getByRole("dialog").last();

    await modal.getByLabel("Current password").fill("e2e-password");
    await modal.getByLabel("New password", { exact: true }).fill("e2e-password-new");
    await modal.getByLabel("Confirm new password").fill("e2e-password-new");

    await modal.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByLabel("Current password")).not.toBeVisible({ timeout: T(8_000) });

    await page.getByRole("button", { name: "Change Password" }).click();
    const modal2 = page.getByRole("dialog").last();
    await expect(modal2.getByLabel("Current password")).toBeVisible({ timeout: T(6_000) });
    await modal2.getByLabel("Current password").fill("e2e-password-new");
    await modal2.getByLabel("New password", { exact: true }).fill("e2e-password");
    await modal2.getByLabel("Confirm new password").fill("e2e-password");
    await modal2.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByLabel("Current password")).not.toBeVisible({ timeout: T(8_000) });
  });
});
