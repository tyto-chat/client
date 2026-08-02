import { test, expect, authedPage } from "./worldFixtures";
import { ChannelSidebar } from "../pages/ChannelSidebar";
import { AppShell } from "../pages/AppShell";

test.describe.serial("Channel access management", () => {
  test("admin adds a member to a private channel → member gains access", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "priv-access", type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar("priv-access");

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel("priv-access");
    await shell.openManageChannelAccess();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 6_000 });

    // Search for the world user — wait for result to load, then add
    await modal.getByRole("textbox").nth(1).fill(world.userName);
    await expect(modal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });
    await modal.getByRole("button", { name: "Add" }).click();

    await expect(modal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });

    const userPage = await authedPage(browser, world.userJwt);
    try {
      await userPage.goto(`/${world.communityId}`);
      await expect(userPage.locator("aside")).toBeVisible({ timeout: 8_000 });
      await expect(userPage.locator(`aside a[href$="/priv-access"]`)).toBeVisible({
        timeout: 6_000,
      });
    } finally {
      await userPage.context().close();
    }
  });

  test("admin kicks a member from a private channel → member loses access", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    // 1. Create a private channel and add the world user to it
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "kick-access", type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar("kick-access");

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel("kick-access");
    await shell.openManageChannelAccess();

    let modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 6_000 });

    // Add the world user — wait for search result before clicking
    await modal.getByRole("textbox").nth(1).fill(world.userName);
    await expect(modal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });
    await modal.getByRole("button", { name: "Add" }).click();
    await expect(modal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });

    // 2. Open user context and verify they can see the channel
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await userPage.goto(`/${world.communityId}`);
      await expect(userPage.locator("aside")).toBeVisible({ timeout: 8_000 });
      await expect(userPage.locator(`aside a[href$="/kick-access"]`)).toBeVisible({
        timeout: 6_000,
      });

      // 3. Admin kicks the member
      await shell.openManageChannelAccess();
      modal = page.getByRole("dialog");
      await expect(modal).toBeVisible({ timeout: 6_000 });
      await modal.getByRole("button", { name: "Kick" }).click();

      await expect(modal.getByText("No members yet.")).toBeVisible({ timeout: 6_000 });

      await modal.getByRole("button", { name: "Close" }).click();
      await expect(modal).not.toBeVisible({ timeout: 6_000 });

      // 4. User page should no longer see the channel after reload
      await userPage.reload();
      await expect(userPage.locator("aside")).toBeVisible({ timeout: 8_000 });
      await expect(userPage.locator(`aside a[href$="/kick-access"]`)).not.toBeVisible({
        timeout: 6_000,
      });
    } finally {
      await userPage.context().close();
    }
  });
});
