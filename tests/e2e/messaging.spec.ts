import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { T } from "./fixtures";

test.describe.serial("Messaging", () => {
  test("send a message — appears in the channel", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `Hello E2E ${Date.now()}`;

    await channel.sendMessage(text);
    await channel.expectMessage(text);
  });

  test("edit own message — shows (edited) label", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const original = `Original ${Date.now()}`;
    const edited = `Edited ${Date.now()}`;

    await channel.sendMessage(original);
    await channel.expectMessage(original);

    await channel.editLastMessage(edited);

    await channel.expectMessage(edited);
    const lastContent = page.locator("main .message-content").last();
    await expect(lastContent.locator("..").getByText("edited", { exact: true })).toBeVisible({
      timeout: T(6_000),
    });
  });

  test("delete own message — shows deleted placeholder", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `To delete ${Date.now()}`;

    await channel.sendMessage(text);
    await channel.expectMessage(text);

    await channel.deleteLastMessage();

    await channel.expectMessageGone(text);
    await expect(page.getByText("This message was deleted.", { exact: true }).last()).toBeVisible({
      timeout: T(6_000),
    });
  });
});

test.describe.serial("Messaging — permission boundaries", () => {
  test("regular user cannot see admin-only controls", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await expect(page.getByTitle(/add channel/i)).toBeHidden();
  });

  test("logged-in user does not see guest prompt", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await expect(page.getByText(/sign in to chat/i)).toBeHidden();
    await expect(page.getByText(/create account/i)).toBeHidden();
  });

  test("logged-in user sees message editor", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await expect(page.locator('[contenteditable="true"]').last()).toBeVisible({
      timeout: T(6_000),
    });
  });

  test("regular user cannot edit another user's message", async ({
    userPage: page,
    browser,
    world,
  }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      const adminChannel = new ChannelPage(adminPage);
      const msgText = `Admin only msg ${Date.now()}`;
      await adminChannel.sendMessage(msgText);
      await adminChannel.expectMessage(msgText);
    } finally {
      await adminPage.context().close();
    }

    // Regular user is already on the channel — reload and hover; Edit must not appear
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await page.locator("main .message-content").last().hover();
    await expect(page.getByTestId(testIds.msgActionEdit).last()).not.toBeVisible({
      timeout: T(3_000),
    });
  });

  test("regular user cannot delete another user's message", async ({
    userPage: page,
    browser,
    world,
  }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      const adminChannel = new ChannelPage(adminPage);
      const msgText = `Admin del msg ${Date.now()}`;
      await adminChannel.sendMessage(msgText);
      await adminChannel.expectMessage(msgText);
    } finally {
      await adminPage.context().close();
    }

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await page.locator("main .message-content").last().hover();
    await expect(page.getByTestId(testIds.msgActionDelete).last()).not.toBeVisible({
      timeout: T(3_000),
    });
  });

  test("empty composer keeps the send button disabled", async ({ adminPage: page, world }) => {
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    const channel = new ChannelPage(page);
    // Focus expands the composer, revealing the send button — it must stay
    // disabled while there is no text (the isEmpty gate), so an empty send is
    // impossible.
    await channel.focusComposer();
    const send = page.getByRole("button", { name: "Send" });
    await expect(send.last()).toBeVisible({ timeout: T(5_000) });
    await expect(send.last()).toBeDisabled();

    await channel.messageEditor.pressSequentially("hi");
    await expect(send.last()).toBeEnabled();
    await channel.messageEditor.press("Control+a");
    await channel.messageEditor.press("Backspace");
    await expect(send.last()).toBeDisabled();
  });

  test("server 500 on send rolls the optimistic message back and restores text", async ({
    adminPage: page,
    world,
  }) => {
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    const channel = new ChannelPage(page);
    const text = `fail-500-${Date.now()}`;

    await page.route("**/messages", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : route.continue(),
    );

    await channel.sendMessage(text);

    // Optimistic chat row rolled back (scope to message rows — the composer
    // restores the typed text into its editor, which is the desired UX).
    await expect(page.locator("main [data-message-id]").filter({ hasText: text })).toHaveCount(0, {
      timeout: T(6_000),
    });
    // Text restored to the composer so it isn't lost.
    await expect(channel.messageEditor).toContainText(text, { timeout: T(6_000) });

    await page.unroute("**/messages");
  });

  test("429 on send restores text so the message can be retried", async ({
    adminPage: page,
    world,
  }) => {
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    const channel = new ChannelPage(page);
    const text = `rate-limited-${Date.now()}`;

    await page.route("**/messages", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 429, contentType: "application/json", body: "{}" })
        : route.continue(),
    );

    await channel.sendMessage(text);

    await expect(page.locator("main [data-message-id]").filter({ hasText: text })).toHaveCount(0, {
      timeout: T(6_000),
    });
    await expect(channel.messageEditor).toContainText(text, { timeout: T(6_000) });

    await page.unroute("**/messages");
  });
});
