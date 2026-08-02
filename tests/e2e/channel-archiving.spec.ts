import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Channel archiving — admin freezes a text channel from the sidebar row menu.
 *
 * UX flow:
 *   1. Hover the channel row → the "More actions" (…) button appears.
 *   2. Click it → "Archive channel" (only shown to admins).
 *   3. Confirm the destructive ConfirmDialog.
 *   4. The channel moves into the collapsed "Archived" sidebar section; the
 *      channel view shows a frozen banner and the composer disappears.
 *   5. Unarchiving is a single click — no confirmation step.
 *
 * Runs against `adminPage` (ROLE_ADMIN) since the archive/unarchive actions
 * are admin-gated. Uses the worker-scoped `world.textChannelId` and restores
 * it to the unarchived state at the end so later same-worker specs are
 * unaffected.
 */

async function openChannelMenu(
  page: import("@playwright/test").Page,
  channelIdentifier: string,
  communityId: string,
): Promise<void> {
  const row = page.locator(`aside div.group`).filter({
    has: page.locator(`a[href$="/${communityId}/${channelIdentifier}"]`),
  });
  await row.hover();
  const moreBtn = row.getByTestId(testIds.channelMoreActionsBtn);
  await expect(moreBtn).toBeAttached({ timeout: 6_000 });
  await moreBtn.click({ force: true });
}

test.describe.serial("Channel archiving", () => {
  test("archive freezes the channel and moves it to the Archived section; unarchive restores it", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    const channel = new ChannelPage(page);
    await shell.gotoChannel(world.textChannelId);

    await expect(channel.messageEditor).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId(testIds.sidebarArchivedSection)).not.toBeVisible({
      timeout: 5_000,
    });

    // Seed a message so the archived channel has content to browse afterwards.
    const seeded = `archive-browse-${Date.now()}`;
    await channel.sendMessage(seeded);
    await channel.expectMessage(seeded);

    await openChannelMenu(page, world.textChannelId, world.communityId);
    const archiveBtn = page.getByTestId(testIds.channelArchiveBtn);
    await expect(archiveBtn).toBeVisible({ timeout: 4_000 });
    await archiveBtn.click();

    await page.getByTestId(testIds.confirmDialogConfirm).click();

    await expect(page.getByTestId(testIds.archivedNotice)).toBeVisible({ timeout: 8_000 });
    await expect(channel.messageEditor).not.toBeVisible({ timeout: 8_000 });

    // Archived channels stay browsable: read-side actions (copy link) remain on
    // the message hover bar, but mutating actions (reply) are gone.
    const lastContent = page.locator("main .message-content").last();
    await lastContent.hover();
    await expect(page.getByTestId(testIds.msgActionCopyLink).last()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId(testIds.msgActionReply)).toHaveCount(0);

    const archivedSection = page.getByTestId(testIds.sidebarArchivedSection);
    await expect(archivedSection).toBeVisible({ timeout: 8_000 });

    const channelInArchived = archivedSection.locator(
      `a[href$="/${world.communityId}/${world.textChannelId}"]`,
    );
    // eslint-disable-next-line playwright/no-conditional-in-test -- section may start collapsed; expand only then
    if (!(await channelInArchived.isVisible())) {
      await archivedSection.locator("button").first().click();
    }
    await expect(channelInArchived).toBeVisible({ timeout: 8_000 });

    // --- Unarchive: single click, no confirmation dialog ---
    await openChannelMenu(page, world.textChannelId, world.communityId);
    const unarchiveBtn = page.getByTestId(testIds.channelUnarchiveBtn);
    await expect(unarchiveBtn).toBeVisible({ timeout: 4_000 });
    await unarchiveBtn.click();

    await expect(page.getByTestId(testIds.sidebarArchivedSection)).not.toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId(testIds.archivedNotice)).not.toBeVisible({ timeout: 8_000 });
    await expect(channel.messageEditor).toBeVisible({ timeout: 8_000 });
  });
});
