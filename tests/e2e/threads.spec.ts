import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { T } from "./fixtures";

async function clickReplyInThread(page: import("@playwright/test").Page): Promise<void> {
  const lastContent = page.locator("main .message-content").last();
  const replyBtn = page.getByTestId(testIds.msgActionReply).last();
  await lastContent.hover();
  await expect(replyBtn).toBeAttached({ timeout: T(8_000) });
  await expect(replyBtn).toBeVisible({ timeout: T(5_000) });
  await replyBtn.hover();
  await replyBtn.click();
}

async function sendThreadReply(page: import("@playwright/test").Page, text: string): Promise<void> {
  const panel = page.getByTestId(testIds.threadPanel);
  // The thread panel's editor is a Tiptap contenteditable inside the panel.
  const editor = panel.locator('[contenteditable="true"]');
  await editor.click();
  await editor.fill(text);
  await editor.press("Enter");
}

test.describe.serial("Threads", () => {
  test("open thread panel — shows root message text", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const rootText = `Thread root ${Date.now()}`;
    await channel.sendMessage(rootText);
    await channel.expectMessage(rootText);

    await clickReplyInThread(page);

    const panel = page.getByTestId(testIds.threadPanel);
    await expect(panel).toBeVisible({ timeout: T(8_000) });
    await expect(panel.getByText(rootText, { exact: false })).toBeVisible({ timeout: T(6_000) });
  });

  test("post a reply — reply appears in the thread panel", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const rootText = `Thread root for reply ${Date.now()}`;
    await channel.sendMessage(rootText);
    await channel.expectMessage(rootText);

    await clickReplyInThread(page);

    const panel = page.getByTestId(testIds.threadPanel);
    await expect(panel).toBeVisible({ timeout: T(8_000) });

    const replyText = `Thread reply ${Date.now()}`;
    await sendThreadReply(page, replyText);

    await expect(panel.getByText(replyText, { exact: false })).toBeVisible({ timeout: T(8_000) });
  });

  test("replies footer on root — persists after reload", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const rootText = `Thread root for footer ${Date.now()}`;
    await channel.sendMessage(rootText);
    await channel.expectMessage(rootText);

    await clickReplyInThread(page);
    const panel = page.getByTestId(testIds.threadPanel);
    await expect(panel).toBeVisible({ timeout: T(8_000) });

    const replyText = `Footer reply ${Date.now()}`;
    await sendThreadReply(page, replyText);
    await expect(panel.getByText(replyText, { exact: false })).toBeVisible({ timeout: T(8_000) });

    await shell.gotoChannel(world.textChannelId);
    await channel.expectMessage(rootText);

    await expect(page.getByTestId(testIds.threadRepliesFooter).first()).toBeVisible({
      timeout: T(8_000),
    });
  });

  test("reply is NOT visible in the main channel timeline", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const rootText = `Thread root timeline check ${Date.now()}`;
    await channel.sendMessage(rootText);
    await channel.expectMessage(rootText);

    await clickReplyInThread(page);
    const panel = page.getByTestId(testIds.threadPanel);
    await expect(panel).toBeVisible({ timeout: T(8_000) });

    const replyText = `Timeline-hidden reply ${Date.now()}`;
    await sendThreadReply(page, replyText);
    await expect(panel.getByText(replyText, { exact: false })).toBeVisible({ timeout: T(8_000) });

    // The reply must NOT appear in the main channel timeline (the <main> element
    // that hosts the message list, excluding the thread panel which is an <aside>).
    const mainTimeline = page.locator("main");
    await expect(mainTimeline.getByText(replyText, { exact: false })).not.toBeVisible({
      timeout: T(4_000),
    });
  });
});
