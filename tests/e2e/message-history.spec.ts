import { test, expect, authedPage } from "./worldFixtures";
import { WorldBuilder } from "./world/builder";
import { E2E_API_URL, E2E_BASE_URL } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Edit history tests.
 * canViewHistory = (isAdmin || canModerate) && (msg.edited || msg.isDeleted) (MessageGroup.tsx)
 * The "Edit history" button (title="Edit history") only appears for admins on edited messages.
 */
test.describe.serial("Message edit history", () => {
  test("edited message shows 'edited' label and admin can view history", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.sendMessage("original text for history test");
    await channel.expectMessage("original text for history test");

    await channel.editLastMessage("updated text for history test");
    await channel.expectMessage("updated text for history test");

    await expect(page.locator("main span", { hasText: /^edited$/ }).last()).toBeVisible({
      timeout: 6_000,
    });

    const lastContent = page.locator("main .message-content").last();
    await lastContent.hover();
    const historyBtn = page.getByTitle("Edit history").last();
    await expect(historyBtn).toBeVisible({ timeout: 6_000 });
    await historyBtn.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 6_000 });
    await expect(modal.getByText("latest")).toBeVisible({ timeout: 6_000 });

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });
  });

  test("unedited message does not show Edit history button", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.sendMessage("unedited history check msg");
    await channel.expectMessage("unedited history check msg");

    // Hover — "Edit history" button must NOT appear in this message row (msg.edited is false)
    const lastContent = page.locator("main .message-content").last();
    await lastContent.hover();
    await expect(lastContent.locator("..").getByTitle("Edit history")).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test("regular user cannot see Edit history button on edited messages", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.sendMessage("original for non-admin history check");
    await channel.expectMessage("original for non-admin history check");
    await channel.editLastMessage("edited for non-admin history check");
    await channel.expectMessage("edited for non-admin history check");

    // Regular member cannot see "Edit history" (canViewHistory requires admin or mod)
    // Use a fresh throwaway member rather than world.userJwt to avoid role pollution
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL);
    await wb.init();
    const member = await wb.createMember(world.communityId, `History Reader ${Date.now()}`);
    await wb.dispose();

    const memberPage = await authedPage(browser, member.jwt);
    try {
      await new AppShell(memberPage, world.communityId).gotoChannel(world.textChannelId);

      const lastContent = memberPage.locator("main .message-content").last();
      await lastContent.hover();
      await expect(lastContent.locator("..").getByTitle("Edit history")).not.toBeVisible({
        timeout: 3_000,
      });
    } finally {
      await memberPage.context().close();
    }
  });
});
