import { test, expect } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import { GroupsModal } from "../pages/GroupsModal";
import { WorldBuilder } from "./world/builder";

test.describe.serial("Group owner — admin manages ownership", () => {
  // Per-worker isolation prevents cross-WORKER leaks, but every spec the worker
  // runs SHARES this worker's `world` (same community + users). This spec makes
  // the regular user the owner of test groups; a leftover owned group flips
  // `ownsAnyGroup` true and surfaces the "Manage community" button for that user
  // in later same-worker specs (groups, moderation). Delete every group in the
  // world via the API once this spec finishes. (`world` is worker-scoped, so it
  // is available in afterAll.)
  test.afterAll(async ({ world }) => {
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      await wb.deleteAllGroups(world.communityId);
    } finally {
      await wb.dispose();
    }
  });

  test("admin can make a group member the owner — Owner badge appears", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);

    await modal.openFromSidebar();
    await modal.createGroup("Owner Test Group");
    await modal.openDetail("Owner Test Group");
    await modal.addMember(world.userName);
    await modal.expectMemberInList(world.userName);

    await modal.makeOwner(world.userName);
    await modal.expectOwnerBadge(world.userName);
    await modal.close();
  });

  test("Owner badge persists after navigating to list and back into detail", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);

    await modal.openFromSidebar();
    // The group from the previous test already has the regular user as owner
    await modal.openDetail("Owner Test Group");
    await modal.expectOwnerBadge(world.userName);
    await modal.close();
  });

  test("Make owner button is not shown on the current owner's row", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);

    await modal.openFromSidebar();
    await modal.openDetail("Owner Test Group");

    const ownerRow = modal.dialog.getByRole("listitem").filter({ hasText: world.userName });
    await expect(ownerRow.getByRole("button", { name: /make owner/i })).toBeHidden();
    await modal.close();
  });

  test("admin can transfer ownership to a different member", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);

    // Create a fresh group with two members so ownership can move between them
    await modal.openFromSidebar();
    await modal.createGroup("Transfer Group");
    await modal.openDetail("Transfer Group");
    await modal.addMember(world.userName);
    await modal.expectMemberInList(world.userName);
    await modal.addMember(world.cadminName);
    await modal.expectMemberInList(world.cadminName);

    await modal.makeOwner(world.userName);
    await modal.expectOwnerBadge(world.userName);
    await modal.expectNoOwnerBadge(world.cadminName);

    await modal.makeOwner(world.cadminName);
    await modal.expectOwnerBadge(world.cadminName);
    await modal.expectNoOwnerBadge(world.userName);

    await modal.close();
  });

  test("removing the owner member from the group clears the Owner badge", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    const modal = new GroupsModal(page);

    await modal.openFromSidebar();
    await modal.createGroup("Remove Owner Group");
    await modal.openDetail("Remove Owner Group");
    await modal.addMember(world.userName);
    await modal.expectMemberInList(world.userName);
    await modal.makeOwner(world.userName);
    await modal.expectOwnerBadge(world.userName);

    await modal.removeMember(world.userName);
    await modal.expectNoMembers();

    await modal.back();
    await modal.openDetail("Remove Owner Group");
    // No member rows exist, so no Owner badge can be present
    await expect(modal.dialog.getByText("Owner", { exact: true })).toBeHidden();
    await modal.close();
  });
});
