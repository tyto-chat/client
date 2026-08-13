import { test, expect, authedPage } from "./worldFixtures";
import { ChannelSidebar } from "../pages/ChannelSidebar";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { T } from "./fixtures";

/**
 * Click "Add as mod" on the search result row for a specific user name.
 * Uses listitem filter to avoid strict-mode violations when multiple results
 * are visible in the autocomplete dropdown.
 */
async function addAsMod(
  modal: import("@playwright/test").Locator,
  page: import("@playwright/test").Page,
  userName: string,
): Promise<void> {
  await modal.getByRole("textbox").first().fill(userName);
  await expect(modal.getByText(userName)).toBeVisible({ timeout: T(10_000) });

  // The candidate list re-renders on each cache invalidation, so the button can
  // detach mid-click. Retry until one click lands — once it does the row is
  // replaced and the button is gone, so this cannot add the member twice.
  const addButton = modal
    .getByRole("listitem")
    .filter({ hasText: userName })
    .getByRole("button", { name: "Add as mod" });
  await expect(async () => {
    await addButton.click({ timeout: T(2_000) });
  }).toPass({ timeout: T(15_000) });
  // Small settle — the Moderators list re-renders after cache update
  await expect(modal.getByText(userName)).toBeVisible({ timeout: T(6_000) });
}

test.describe.serial("Channel moderators", () => {
  test("admin adds user as moderator → appears in moderators list", async ({
    adminPage: page,
    world,
  }) => {
    const chName = `mod-add-ch-${world.communityId}`;
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: chName, type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar(chName);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(chName);
    await shell.openManageChannelAccess();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: T(6_000) });

    await addAsMod(modal, page, world.userName);

    await expect(modal.getByText("No moderators yet.")).toBeHidden();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });

  test("moderator sees Manage channel access button on private channel", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const chName = `mod-vis-ch-${world.communityId}`;

    // 1. Create private channel, add world user as moderator
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: chName, type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar(chName);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(chName);
    await shell.openManageChannelAccess();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: T(6_000) });
    await addAsMod(modal, page, world.userName);

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });

    // 2. Open world user context — they're a moderator so they can see the private channel
    const userPage = await authedPage(browser, world.userJwt);
    try {
      const userShell = new AppShell(userPage, world.communityId);
      await userShell.gotoChannel(chName);

      // Moderator sees "Manage channel access" (isChannelModerator && isPrivate)
      await userShell.openChannelHeaderMenu();
      await expect(userPage.getByRole("menuitem", { name: "Manage channel access" })).toBeVisible({
        timeout: T(6_000),
      });
    } finally {
      await userPage.context().close();
    }
  });

  test("moderator can delete another user's message", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const chName = `mod-del-ch-${world.communityId}`;

    // Create a public channel and make world user a moderator
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: chName, type: "text" });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar(chName);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(chName);

    const channel = new ChannelPage(page);
    await channel.sendMessage("admin post for mod to delete");
    await channel.expectMessage("admin post for mod to delete");

    await shell.openManageChannelAccess();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: T(6_000) });
    await addAsMod(modal, page, world.userName);
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });

    const userPage = await authedPage(browser, world.userJwt);
    try {
      const userShell = new AppShell(userPage, world.communityId);
      await userShell.gotoChannel(chName);

      // Moderator deletes the admin's message (canDelete = isAdmin || isAuthor || isChannelModerator)
      const userChannel = new ChannelPage(userPage);
      await userChannel.deleteLastMessage();
      await userChannel.expectMessageGone("admin post for mod to delete");
    } finally {
      await userPage.context().close();
    }
  });

  test("admin can promote a member to moderator via Make mod button", async ({
    adminPage: page,
    world,
  }) => {
    const chName = `mod-promote-ch-${world.communityId}`;

    // This verifies the Members section "Make mod" button.
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: chName, type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar(chName);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(chName);
    await shell.openManageChannelAccess();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: T(6_000) });

    await expect(modal.getByText("No moderators yet.")).toBeVisible({ timeout: T(6_000) });
    await expect(modal.getByText("No members yet.")).toBeVisible({ timeout: T(6_000) });

    await addAsMod(modal, page, world.userName);
    await expect(modal.getByRole("button", { name: "Remove mod" })).toBeVisible({
      timeout: T(6_000),
    });

    // Demote to member via "Remove mod" — user moves to Members section
    await modal.getByRole("button", { name: "Remove mod" }).click();
    await expect(modal.getByText("No moderators yet.")).toBeVisible({ timeout: T(6_000) });

    await modal.getByRole("button", { name: "Make mod" }).click();

    // Cache is updated immediately via setQueryData — user moves to Moderators list.
    await expect(modal.getByRole("button", { name: "Remove mod" })).toBeVisible({
      timeout: T(6_000),
    });
    await expect(modal.getByRole("button", { name: "Make mod" })).toBeHidden();

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });

  test("admin removes moderator role → user no longer in moderators list", async ({
    adminPage: page,
    world,
  }) => {
    const chName = `mod-rm-ch-${world.communityId}`;
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: chName, type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar(chName);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(chName);
    await shell.openManageChannelAccess();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: T(6_000) });

    await addAsMod(modal, page, world.userName);

    await modal.getByRole("button", { name: "Remove mod" }).click();
    await expect(modal.getByText("No moderators yet.")).toBeVisible({ timeout: T(6_000) });

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: T(6_000) });
  });
});
