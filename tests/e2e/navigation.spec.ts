import { test, expect } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";

test.describe.serial("Navigation — admin", () => {
  test("community sidebar renders the seeded community", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the community nav to render before clicking
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 8_000 });
    await shell.clickCommunity(world.communityId);
    await expect(page).toHaveURL(new RegExp(world.communityId), { timeout: 8_000 });
  });

  test("navigating to a text channel loads its view", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await shell.expectChannelVisible(world.textChannelId);
    await expect(page.locator('[contenteditable="true"]').last()).toBeVisible();
  });

  test("navigating to an audio channel renders audio view", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.audioChannelId);
    await shell.expectChannelVisible(world.audioChannelId);
    // Audio channel view — no message editor, shows a join/voice button
    await expect(page.locator('[contenteditable="true"]')).toBeHidden();
  });

  test("direct URL navigation to channel works", async ({ adminPage: page, world }) => {
    await page.goto(`/${world.communityId}/${world.textChannelId}`);
    await expect(page).toHaveURL(new RegExp(world.textChannelId));
    await expect(page.locator('[contenteditable="true"]').last()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe.serial("Navigation — regular user", () => {
  test("regular user can access the seeded community", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await shell.expectChannelVisible(world.textChannelId);
  });

  test("navigating to a non-existent community redirects home", async ({ userPage: page }) => {
    // The channel loader 404s on an unknown community and throws redirect({to:"/"}).
    await page.goto("/no-such-community-xyz/no-such-channel");
    await expect(page).not.toHaveURL(/no-such-community-xyz/, { timeout: 10_000 });
  });

  test("permalink to a non-existent message shows the unavailable page", async ({
    userPage: page,
  }) => {
    // GET /api/messages/{uuid} 404s → resolver renders the generic not-available
    // view (403/404 deliberately conflated), leaking nothing.
    await page.goto("/m/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Message not available")).toBeVisible({ timeout: 10_000 });
  });
});
