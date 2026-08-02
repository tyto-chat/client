import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { GroupsModal } from "../pages/GroupsModal";

test.describe.serial("Groups management — admin", () => {
  test("admin sees the manage-community button in sidebar", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await page.getByTestId(testIds.communityActionsBtn).click();
    await expect(page.getByTestId(testIds.manageCommunity)).toBeVisible({ timeout: 6_000 });
  });

  test("admin can create a group", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);
    await modal.openFromSidebar();
    await modal.createGroup("E2E Group");
    await modal.expectGroupInList("E2E Group");
    await modal.close();
  });

  test("admin can edit a group name", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);
    await modal.openFromSidebar();
    await modal.createGroup("Edit Me");
    await modal.editGroup("Edit Me", "Edited Group");
    await modal.expectGroupInList("Edited Group");
    await modal.close();
  });

  test("admin can delete a group", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);
    await modal.openFromSidebar();
    await modal.createGroup("Delete Me");
    await modal.expectGroupInList("Delete Me");
    await modal.deleteGroup("Delete Me");
    await modal.expectGroupGone("Delete Me");
    await modal.close();
  });

  test("admin can add and remove a group member", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);
    await modal.openFromSidebar();
    await modal.createGroup("Members Group");
    await modal.openDetail("Members Group");
    await modal.addMember(world.userName);
    await modal.expectMemberInList(world.userName);
    await modal.removeMember(world.userName);
    await modal.expectNoMembers();
    await modal.close();
  });

  test("admin can set a channel permission and it persists across view navigation", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);
    await modal.openFromSidebar();
    await modal.createGroup("Perms Group");
    await modal.openDetail("Perms Group");
    await modal.openChannelPermissions();

    await expect(modal.dialog.getByText(world.textChannelId)).toBeVisible({ timeout: 6_000 });
    await modal.setChannelPermission(world.textChannelId, "moderator");

    // Navigate away and back — cache (staleTime: Infinity) must retain the value
    await modal.back();
    await modal.openChannelPermissions();
    await modal.expectChannelPermission(world.textChannelId, "moderator");

    await modal.close();
  });
});

test.describe.serial("Group badges in chat", () => {
  test("group badge appears on message from a group member", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const modal = new GroupsModal(page);
    await modal.openFromSidebar();
    await modal.createGroup("Badge Group");
    await modal.openDetail("Badge Group");
    await modal.addMember(world.userName);
    await modal.expectMemberInList(world.userName);
    await modal.close();

    const userPage = await authedPage(browser, world.userJwt);
    try {
      const msgText = `Badge test ${Date.now()}`;
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      await new ChannelPage(userPage).sendMessage(msgText);
      await new ChannelPage(userPage).expectMessage(msgText);

      // Admin reloads — community members data is refreshed, badge should appear
      await page.reload();
      await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("main").getByText(msgText)).toBeVisible({ timeout: 8_000 });
      await expect(page.getByTitle("Badge Group")).toBeVisible({ timeout: 6_000 });
    } finally {
      await userPage.context().close();
    }
  });
});

test.describe.serial("Groups — regular user restrictions", () => {
  test("regular user does not see manage-community button in sidebar", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await page.locator("aside").hover();
    // Button is conditionally rendered for admins / community mods only.
    await expect(page.getByTestId(testIds.manageCommunity)).toHaveCount(0);
  });
});
