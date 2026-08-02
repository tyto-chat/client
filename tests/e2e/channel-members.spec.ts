import { test, expect } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelSidebar } from "../pages/ChannelSidebar";

// Helper: admin creates a private channel and adds the world user to it.
// Returns the channel identifier (slug).
async function createPrivateChannelWithUser(
  adminPage: import("@playwright/test").Page,
  world: import("./world/types").World,
  channelName: string,
): Promise<string> {
  const sidebar = new ChannelSidebar(adminPage, world.communityId);
  await sidebar.goto();
  await sidebar.openCreateChannelInSection("Text Channels");
  await sidebar.fillChannelModal({ name: channelName, type: "text", isPrivate: true });
  await sidebar.submitModal();

  const shell = new AppShell(adminPage, world.communityId);
  await shell.gotoChannel(channelName);
  await shell.openManageChannelAccess();
  const modal = adminPage.getByRole("dialog");
  await expect(modal).toBeVisible({ timeout: 6_000 });
  await modal.getByRole("textbox").nth(1).fill(world.userName);
  await expect(modal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });
  await modal.getByRole("button", { name: "Add" }).click();
  await expect(modal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });
  await modal.getByRole("button", { name: "Close" }).click();
  await expect(modal).not.toBeVisible({ timeout: 6_000 });

  return channelName; // identifier = slugified name (same if no spaces)
}

test.describe.serial("Channel members modal — regular user", () => {
  test("'View members' button is visible in a private channel the user belongs to", async ({
    userPage: page,
    adminPage,
    world,
  }) => {
    const channelId = `view-members-${Date.now()}`;
    await createPrivateChannelWithUser(adminPage, world, channelId);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelId);

    await shell.openChannelHeaderMenu();
    await expect(page.getByRole("menuitem", { name: "View members" })).toBeVisible({
      timeout: 6_000,
    });
  });

  test("members modal shows the channel's member list", async ({
    userPage: page,
    adminPage,
    world,
  }) => {
    const channelId = `modal-list-${Date.now()}`;
    await createPrivateChannelWithUser(adminPage, world, channelId);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelId);
    await shell.openChannelMembers();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 6_000 });
    await expect(modal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });
  });

  test("user can leave a private channel via the members modal", async ({
    userPage: page,
    adminPage,
    world,
  }) => {
    const channelId = `leave-modal-${Date.now()}`;
    await createPrivateChannelWithUser(adminPage, world, channelId);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelId);

    await shell.openChannelMembers();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 6_000 });

    // Two-step leave confirmation
    await modal.getByRole("button", { name: "Leave channel" }).click();
    await expect(modal.getByText("Leave this channel?")).toBeVisible({ timeout: 4_000 });
    await modal.getByRole("button", { name: "Leave" }).click();

    // User should be redirected away from the private channel
    // (the community index may forward to another channel like /general)
    await expect(page).not.toHaveURL(new RegExp(`/${channelId}`), { timeout: 8_000 });

    await expect(page.locator(`aside a[href$="/${channelId}"]`)).not.toBeVisible({
      timeout: 6_000,
    });
  });

  test('"Cancel" on the leave confirmation step restores the leave button', async ({
    userPage: page,
    adminPage,
    world,
  }) => {
    const channelId = `cancel-leave-${Date.now()}`;
    await createPrivateChannelWithUser(adminPage, world, channelId);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelId);

    await shell.openChannelMembers();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 6_000 });

    await modal.getByRole("button", { name: "Leave channel" }).click();
    await expect(modal.getByText("Leave this channel?")).toBeVisible({ timeout: 4_000 });

    await modal.getByRole("button", { name: "Cancel" }).click();

    await expect(modal.getByRole("button", { name: "Leave channel" })).toBeVisible({
      timeout: 4_000,
    });
    await expect(modal.getByText("Leave this channel?")).toBeHidden();
  });
});

test.describe.serial("Channel members modal — admin", () => {
  test("admin sees 'Manage channel access' but NOT 'View members' on a private channel", async ({
    adminPage: page,
    world,
  }) => {
    const channelId = `admin-no-view-${Date.now()}`;
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: channelId, type: "text", isPrivate: true });
    await sidebar.submitModal();

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelId);

    await shell.openChannelHeaderMenu();
    await expect(page.getByRole("menuitem", { name: "Manage channel access" })).toBeVisible({
      timeout: 6_000,
    });
    await expect(page.getByRole("menuitem", { name: "View members" })).toHaveCount(0);
  });
});
