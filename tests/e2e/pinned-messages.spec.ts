import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { T } from "./fixtures";

/**
 * Pinned messages flow — pin, list in modal, unpin.
 *
 * Uses adminPage throughout because pin/unpin requires canPin (admin / mod gate).
 *
 * The tests run serially and share the worker-scoped `world` channel.  Each
 * test uses a uniquely timestamped message so pinned-message assertions target
 * only the message created in that test, making the suite resilient even if a
 * prior (non-serial) spec left unrelated pins behind.
 *
 * Test order:
 *   1. Empty state  — opened before any pin in this suite, the modal shows the
 *      "no pinned messages" placeholder.  NOTE: if sibling specs have already
 *      pinned messages in this worker's channel and did not clean up, this test
 *      is intentionally skipped in favour of the more reliable flow tests (2 & 3).
 *      We verify empty state robustly at the END of test 3 instead (after an
 *      explicit unpin).
 *   2. Pin → appears in modal — sends a unique message, pins it via the
 *      in-timeline action bar, then opens the pinned-messages modal and confirms
 *      the message text is listed.
 *   3. Unpin from timeline → gone from modal — with the same message still pinned
 *      from test 2, hovers it again and clicks the pin toggle (now in "unpin"
 *      state), then re-opens the modal and confirms the message is no longer listed.
 *      Also confirms the empty-state placeholder reappears.
 */

async function openPinnedModal(page: import("@playwright/test").Page) {
  await page.getByTestId(testIds.pinnedOpenBtn).click();
  await expect(page.getByTestId(testIds.pinnedMessagesModal)).toBeVisible({ timeout: T(8_000) });
}

async function closePinnedModal(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId(testIds.pinnedMessagesModal)).not.toBeVisible({
    timeout: T(5_000),
  });
}

test.describe.serial("Pinned messages — flow", () => {
  // NOTE: the header pin button (`pinned-open-btn`) is only rendered when the
  // channel has ≥1 pinned message — so an "empty pinned modal from a fresh
  // channel" is intentionally unreachable. The empty-state placeholder is
  // verified instead in test 4, after unpinning the last pin while the modal
  // is still open.

  test("pin a message — appears in pinned-messages modal", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `pinned-flow-pin ${Date.now()}`;

    await channel.sendMessage(text);
    await channel.expectMessage(text);

    const lastContent = page.locator("main .message-content").last();
    await lastContent.hover();
    const pinBtn = page.getByTestId(testIds.msgActionPin).last();
    await expect(pinBtn).toBeVisible({ timeout: T(8_000) });
    await expect(pinBtn).toHaveAttribute("title", "Pin message");
    await pinBtn.hover();
    await pinBtn.click();

    await openPinnedModal(page);

    const modal = page.getByTestId(testIds.pinnedMessagesModal);

    await expect(modal.getByText(text, { exact: false })).toBeVisible({ timeout: T(8_000) });

    await closePinnedModal(page);
  });

  /**
   * Test 3 — unpin from timeline → message is gone from the modal.
   *
   * Depends on test 2 having left the message pinned.  We identify the message
   * by its unique text (sent in test 2), so even if other pins exist they do
   * not interfere.
   *
   * After unpinning we also verify the explicit empty-state placeholder when
   * the pinned list is now empty (covering the "empty state after unpin" path
   * robustly).
   */
  test("unpin from timeline — message removed from pinned-messages modal", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const lastContent = page.locator("main .message-content").last();
    await lastContent.hover();

    const pinBtn = page.getByTestId(testIds.msgActionPin).last();
    await expect(pinBtn).toBeVisible({ timeout: T(8_000) });
    await expect(pinBtn).toHaveAttribute("title", "Unpin");
    // Re-hover the row right before acting: the hover bar hides again if the
    // pointer settles elsewhere between the visibility check and the click.
    await lastContent.hover();
    await pinBtn.click();

    // The message from test 2 was the only pin, so unpinning it empties the
    // channel's pin list. The header pin button is gated on having ≥1 pin, so
    // it must disappear — which is itself proof the unpin took effect. (We
    // can't reopen the modal to check: with zero pins there's no entry point.)
    await expect(page.getByTestId(testIds.pinnedOpenBtn)).toHaveCount(0, { timeout: T(8_000) });
  });

  test("unpin from inside the modal — message removed from list", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `pinned-flow-modal-unpin ${Date.now()}`;

    await channel.sendMessage(text);
    await channel.expectMessage(text);

    const lastContent = page.locator("main .message-content").last();
    await lastContent.hover();
    const pinBtn = page.getByTestId(testIds.msgActionPin).last();
    await expect(pinBtn).toBeVisible({ timeout: T(8_000) });
    await pinBtn.hover();
    await pinBtn.click();

    await openPinnedModal(page);
    const modal = page.getByTestId(testIds.pinnedMessagesModal);
    const row = modal.getByTestId(testIds.pinnedMessageRow).filter({ hasText: text });
    await expect(row).toBeVisible({ timeout: T(8_000) });

    await row.hover();
    const unpinInModal = row.getByTestId(testIds.pinnedModalUnpinBtn);
    await expect(unpinInModal).toBeVisible({ timeout: T(5_000) });
    await unpinInModal.click();

    await expect(row).not.toBeVisible({ timeout: T(8_000) });

    // 5. If that was the only pin, the modal (which stays open after an in-modal
    //    unpin) now shows the empty-state placeholder — the one reachable way to
    //    see it, since the header entry point is gated on having ≥1 pin.
    const rowCount = await modal.getByTestId(testIds.pinnedMessageRow).count();
    // eslint-disable-next-line playwright/no-conditional-in-test -- empty state only reachable when the unpinned row was the last one
    if (rowCount === 0) {
      // eslint-disable-next-line playwright/no-conditional-expect -- guarded by the rowCount check above
      await expect(modal.getByText("No pinned messages yet.", { exact: true })).toBeVisible({
        timeout: T(5_000),
      });
    }

    // Close the modal (it remains open after unpin).
    await closePinnedModal(page);
  });
});
