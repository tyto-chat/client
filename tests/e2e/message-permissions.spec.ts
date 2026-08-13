import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { T } from "./fixtures";

/**
 * Message action permission boundaries (ROLE_PERMISSIONS.md § Messages).
 *
 * Two actions are gated to the moderation audience and hidden from plain users
 * in the hover action bar:
 *   - Pin/Unpin — `ChannelVoter::PIN` (channel mod / community mod / admin); plain User = ✗.
 *   - View-history — same moderation audience (reuses `ChannelVoter::PIN`); plain User = ✗.
 *
 * The client gates them via `canPin` / `canViewHistory`, so the buttons are not
 * rendered at all for a regular user (asserted by testid count, decoupled from copy).
 */
test.describe.serial("Message permissions — pin", () => {
  test("regular user sees no pin action on a message", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `pin-deny ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);

    await page.locator("main .message-content").last().hover();
    // The action bar IS shown (own message → Edit appears), but pin is absent.
    await expect(page.getByTestId(testIds.msgActionEdit).last()).toBeVisible({ timeout: T(5_000) });
    await expect(page.getByTestId(testIds.msgActionPin)).toHaveCount(0);
  });

  test("admin sees the pin action on a message", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `pin-allow ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);

    await page.locator("main .message-content").last().hover();
    await expect(page.getByTestId(testIds.msgActionPin).last()).toBeVisible({ timeout: T(5_000) });
  });
});

test.describe.serial("Message permissions — view history", () => {
  test("regular user sees no view-history action on an edited message", async ({
    userPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const original = `hist-deny ${Date.now()}`;
    await channel.sendMessage(original);
    await channel.expectMessage(original);

    // Edit it so an edit-history actually exists — the only reason the button
    // stays hidden is the role gate, not the absence of history.
    const edited = `hist-deny-edited ${Date.now()}`;
    await channel.editLastMessage(edited);
    await channel.expectMessage(edited);

    await page.locator("main .message-content").last().hover();
    await expect(page.getByTestId(testIds.msgActionEdit).last()).toBeVisible({ timeout: T(5_000) });
    await expect(page.getByTestId(testIds.msgActionHistory)).toHaveCount(0);
  });
});
