import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { WorldBuilder } from "./world/builder";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { ConversationPage } from "../pages/ConversationPage";

/**
 * DM lifecycle tests — both users share the per-worker community, satisfying
 * the shared-community gate. Conversations are immutable once created (no
 * invite/accept/leave), and idempotent on the participant set (creating the
 * same DM twice returns the existing row).
 */
test.describe.serial("Direct messages — lifecycle", () => {
  test("Both members exchange messages via Mercure", async ({ browser, world }) => {
    const adminApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await adminApi.init();
    const userId = await adminApi.findUserIdByName(world.userName);
    const conv = await adminApi.createConversation([userId]);
    await adminApi.dispose();

    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);

    try {
      const adminConv = new ConversationPage(adminPage);
      const userConv = new ConversationPage(userPage);

      await adminConv.goto(conv.identifier, { waitForMercure: true });
      await userConv.goto(conv.identifier, { waitForMercure: true });

      const adminText = `DM from admin ${Date.now()}`;
      await adminConv.sendMessage(adminText);
      await adminConv.expectMessage(adminText);
      await userConv.expectMessage(adminText, 10_000);

      const userText = `DM from user ${Date.now()}`;
      await userConv.sendMessage(userText);
      await userConv.expectMessage(userText);
      await adminConv.expectMessage(userText, 10_000);
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });

  test("Creating DM with same participants returns existing conversation", async ({ world }) => {
    const api = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await api.init();
    try {
      const userId = await api.findUserIdByName(world.userName);
      const first = await api.createConversation([userId]);
      const second = await api.createConversation([userId]);

      expect(second.identifier).toBe(first.identifier);
    } finally {
      await api.dispose();
    }
  });

  test("User mutes a conversation → row shows muted styling", async ({ browser, world }) => {
    const adminApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await adminApi.init();
    const userId = await adminApi.findUserIdByName(world.userName);
    const conv = await adminApi.createConversation([userId]);
    await adminApi.dispose();

    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);

    try {
      const adminConv = new ConversationPage(adminPage);
      const userConv = new ConversationPage(userPage);

      await userConv.goto(conv.identifier, { waitForMercure: true });
      await userConv.toggleMute();

      await userPage.goto("/");

      await adminConv.goto(conv.identifier, { waitForMercure: true });
      await adminConv.sendMessage(`muted msg ${Date.now()}`);

      await userPage.goto("/dm");
      await expect(userPage.getByTestId(testIds.dmMutedIndicator).first()).toBeVisible({
        timeout: T(10_000),
      });
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });

  test("Reactions on DM messages propagate via Mercure", async ({ browser, world }) => {
    const adminApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await adminApi.init();
    const userId = await adminApi.findUserIdByName(world.userName);
    const conv = await adminApi.createConversation([userId]);
    await adminApi.dispose();

    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);

    try {
      const adminConv = new ConversationPage(adminPage);
      const userConv = new ConversationPage(userPage);

      await adminConv.goto(conv.identifier, { waitForMercure: true });
      await userConv.goto(conv.identifier, { waitForMercure: true });

      const text = `react-target ${Date.now()}`;
      await adminConv.sendMessage(text);
      await adminConv.expectMessage(text);
      await userConv.expectMessage(text, 10_000);

      await userConv.addReactionToLastMessage("🎉");
      await userConv.expectReactionPill("🎉");
      await adminConv.expectReactionPill("🎉", 10_000);
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });
});

test.describe.serial("Direct messages — access", () => {
  test("non-participant cannot open someone else's DM", async ({ userPage, world }) => {
    // Admin ↔ cadmin DM; the regular user is not a participant.
    const adminApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await adminApi.init();
    const cadminId = await adminApi.findUserIdByName(world.cadminName);
    const conv = await adminApi.createConversation([cadminId]);
    await adminApi.dispose();

    await userPage.goto(`/dm/${conv.identifier}`);

    // useConversation 403/404s for a non-member → the route shows not-found,
    // never the message history.
    await expect(userPage.getByText("Conversation not found.")).toBeVisible({ timeout: T(10_000) });
  });
});

test.describe.serial("Direct messages — threads", () => {
  test("participant replies in a DM thread; reply stays out of the timeline", async ({
    browser,
    world,
  }) => {
    const adminApi = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await adminApi.init();
    const userId = await adminApi.findUserIdByName(world.userName);
    const conv = await adminApi.createConversation([userId]);
    await adminApi.dispose();

    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      const adminConv = new ConversationPage(adminPage);
      await adminConv.goto(conv.identifier, { waitForMercure: true });

      const rootText = `DM thread root ${Date.now()}`;
      await adminConv.sendMessage(rootText);
      await adminConv.expectMessage(rootText);

      await adminPage.locator("main .message-content").last().hover();
      const replyBtn = adminPage.getByTestId(testIds.msgActionReply).last();
      await expect(replyBtn).toBeVisible({ timeout: T(5_000) });
      await replyBtn.click();

      const panel = adminPage.getByTestId(testIds.threadPanel);
      await expect(panel).toBeVisible({ timeout: T(8_000) });
      await expect(panel.getByText(rootText, { exact: false })).toBeVisible({ timeout: T(6_000) });

      const replyText = `DM thread reply ${Date.now()}`;
      const editor = panel.locator('[contenteditable="true"]');
      await editor.click();
      await editor.fill(replyText);
      await editor.press("Enter");

      await expect(panel.getByText(replyText, { exact: false })).toBeVisible({ timeout: T(8_000) });

      // The reply must not appear in the main DM timeline.
      const timeline = adminPage.locator("main [role='log']").first();
      await expect(timeline.getByText(replyText, { exact: false })).toHaveCount(0);
    } finally {
      await adminPage.context().close();
    }
  });
});
