/**
 * Anonymous browsing tests — no storageState (base `page` fixture, unauthenticated).
 *
 * Verifies that anonymous users can read public communities and channels
 * but are shown appropriate prompts instead of write controls.
 */
import { test, expect } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";
import { T } from "./fixtures";

test.describe.serial("Anonymous browsing", () => {
  // `world` is unused but requested: it seeds the public community this asserts on.
  test("anonymous user lands on public community, not /login", async ({ page, world }) => {
    void world;
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/, { timeout: T(8_000) });
    // App redirects to the first public community (not necessarily the per-worker one)
    await expect(page).toHaveURL(/\/[a-z0-9-]+\/[a-z0-9-]+/, { timeout: T(8_000) });
  });

  test("community sidebar is visible to anonymous users", async ({ page, world }) => {
    void world;
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: T(10_000) });
  });

  test("anonymous user can navigate directly to a text channel", async ({ page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await expect(page).toHaveURL(new RegExp(world.textChannelId));
  });

  test("anonymous user can navigate directly to a voice channel", async ({ page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.audioChannelId);
    await expect(page).toHaveURL(new RegExp(world.audioChannelId));
  });

  test("text channel shows guest prompt for anonymous user", async ({ page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await expect(page.getByText(/log in or create an account/i).first()).toBeVisible({
      timeout: T(8_000),
    });
  });

  test("message editor is hidden for anonymous user in text channel", async ({ page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    // Wait for channel to load before asserting absence
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });
    await expect(page.locator('[contenteditable="true"]')).toBeHidden();
  });

  test("guest prompt in text channel contains Sign in button that opens modal", async ({
    page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const signInBtn = page.getByRole("button", { name: /sign in/i }).first();
    await expect(signInBtn).toBeVisible({ timeout: T(8_000) });
    await signInBtn.click();
    await expect(page.locator("#email")).toBeVisible({ timeout: T(5_000) });
    await expect(page).toHaveURL(new RegExp(world.textChannelId));
  });

  test("guest prompt in text channel contains Create account button that opens modal", async ({
    page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const createBtn = page.getByRole("button", { name: /create account/i }).first();
    await expect(createBtn).toBeVisible({ timeout: T(8_000) });
    await createBtn.click();
    await expect(page.locator("#email")).toBeVisible({ timeout: T(5_000) });
    await expect(page).toHaveURL(new RegExp(world.textChannelId));
  });

  test("voice channel shows guest voice prompt for anonymous user", async ({ page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.audioChannelId);
    await expect(
      page.getByText(/log in or create an account to join this voice channel/i),
    ).toBeVisible({ timeout: T(8_000) });
  });

  test("Join Voice button is hidden for anonymous user", async ({ page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.audioChannelId);
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });
    await expect(page.getByRole("button", { name: /join voice/i })).toBeHidden();
  });

  test("voice channel guest prompt contains Sign in button that opens modal", async ({
    page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.audioChannelId);
    // Both text channel and voice channel share auth buttons; pick the one in main
    const signInBtn = page.locator("main").getByRole("button", { name: /sign in/i });
    await expect(signInBtn).toBeVisible({ timeout: T(8_000) });
    await signInBtn.click();
    await expect(page.locator("#email")).toBeVisible({ timeout: T(5_000) });
  });

  test("/login has a close button that navigates to / when a public community exists", async ({
    page,
  }) => {
    // E2E environment always has a public community, so the login page shows
    // a Close (✕) button in the top-right instead of a Back button.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);

    const closeButton = page.getByTitle("Close");
    await expect(closeButton).toBeVisible({ timeout: T(5_000) });
    await closeButton.click();

    // / redirects to the first public community, so we just verify we left /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: T(8_000) });
  });

  test("/register has a close button that navigates away", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/register/);

    const closeButton = page.getByTitle("Close");
    await expect(closeButton).toBeVisible({ timeout: T(5_000) });
    await closeButton.click();

    await expect(page).not.toHaveURL(/\/register/, { timeout: T(8_000) });
  });
});
