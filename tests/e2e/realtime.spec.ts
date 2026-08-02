import { test, authedPage } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Real-time tests open two browser contexts — one per user — and verify that
 * Mercure SSE events propagate between them without a page refresh.
 *
 * These tests are inherently slower (SSE round-trip) and use a 10s timeout.
 */
test.describe.serial("Real-time messaging (Mercure SSE)", () => {
  test("User A sends a message → User B sees it without refresh", async ({ browser, world }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);

    try {
      const adminChannel = new ChannelPage(adminPage);
      const userChannel = new ChannelPage(userPage);

      // Both users open the same text channel; wait for Mercure SSE to be established
      // before admin sends so the user's subscription is ready to receive the event.
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });

      const text = `SSE test ${Date.now()}`;
      await adminChannel.sendMessage(text);

      // Admin sees it immediately (optimistic / server response)
      await adminChannel.expectMessage(text);

      // Regular user should see it via Mercure SSE without refreshing
      await userChannel.expectMessage(text, 10_000);
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });

  test("User A edits a message → User B sees the update", async ({ browser, world }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);

    try {
      const adminChannel = new ChannelPage(adminPage);
      const userChannel = new ChannelPage(userPage);

      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });

      const original = `Edit-SSE ${Date.now()}`;
      await adminChannel.sendMessage(original);
      await adminChannel.expectMessage(original);

      await userChannel.expectMessage(original, 10_000);

      const edited = `Edited-SSE ${Date.now()}`;
      await adminChannel.editLastMessage(edited);
      await adminChannel.expectMessage(edited);

      await userChannel.expectMessage(edited, 10_000);
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });

  test("User A deletes a message → User B sees deletion", async ({ browser, world }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);

    try {
      const adminChannel = new ChannelPage(adminPage);
      const userChannel = new ChannelPage(userPage);

      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });

      const text = `Delete-SSE ${Date.now()}`;
      await adminChannel.sendMessage(text);
      await adminChannel.expectMessage(text);
      await userChannel.expectMessage(text, 10_000);

      await adminChannel.deleteLastMessage();
      await adminChannel.expectMessageGone(text);

      await userChannel.expectMessageGone(text, 10_000);
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });
});
