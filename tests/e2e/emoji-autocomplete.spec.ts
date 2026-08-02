import { test, expect } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Emoji autocomplete tests.
 *
 * The dropdown opens on `:` at a word boundary followed by at least one
 * non-colon character, fed by the Unicode catalog and (if any) community
 * emojis. Pressing Enter or clicking inserts the glyph for Unicode picks
 * or the literal `:shortcode:` text for custom picks. Clicking outside
 * the dropdown dismisses it.
 */
test.describe.serial("Emoji autocomplete", () => {
  test("typing `:smil` opens a dropdown of matching emoji names", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();
    await channel.messageEditor.pressSequentially(":smil");

    // Unicode catalog has many smiling-face entries; expect at least one
    // suggestion button whose label contains "smil".
    await expect(page.getByRole("button", { name: /smil/i }).first()).toBeVisible({
      timeout: 6_000,
    });
  });

  test("picking a suggestion inserts the glyph and the message renders it", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();
    await channel.messageEditor.pressSequentially(":slightly");

    const suggestion = page.getByRole("button", { name: /slightly smiling face/i }).first();
    await expect(suggestion).toBeVisible({ timeout: 6_000 });
    await suggestion.click();

    await channel.messageEditor.press("Enter");

    await expect(page.locator("main .message-content").last()).toContainText("🙂", {
      timeout: 6_000,
    });
  });

  test("Enter key picks the highlighted suggestion without sending", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();
    await channel.messageEditor.pressSequentially(":slightly");

    await expect(page.getByRole("button", { name: /slightly smiling face/i }).first()).toBeVisible({
      timeout: 6_000,
    });

    // Suggestion dropdown intercepts Enter — it picks, not submit.
    await channel.messageEditor.press("Enter");

    await expect(page.getByRole("button", { name: /slightly smiling face/i })).toHaveCount(0, {
      timeout: 4_000,
    });
    // Editor still focused with the glyph inserted (no message sent yet).
    await expect(channel.messageEditor).toContainText("🙂", { timeout: 4_000 });
  });

  test("clicking outside the dropdown dismisses it", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();
    await channel.messageEditor.pressSequentially(":smil");

    await expect(page.getByRole("button", { name: /smil/i }).first()).toBeVisible({
      timeout: 6_000,
    });

    // Click somewhere unrelated — the community sidebar is far from the
    // editor and dropdown, so it is a safe outside target.
    await page
      .locator("aside")
      .first()
      .click({ position: { x: 5, y: 5 } });

    await expect(page.getByRole("button", { name: /smil/i })).toHaveCount(0, { timeout: 4_000 });
  });

  test("Escape dismisses the dropdown", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();
    await channel.messageEditor.pressSequentially(":smil");

    await expect(page.getByRole("button", { name: /smil/i }).first()).toBeVisible({
      timeout: 6_000,
    });

    await channel.messageEditor.press("Escape");

    await expect(page.getByRole("button", { name: /smil/i })).toHaveCount(0, { timeout: 4_000 });
  });

  test("`:` mid-word (no preceding space) does not trigger autocomplete", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();
    // Word boundary missing — the suggestion plugin's `allowedPrefixes: [' ']`
    // should suppress the dropdown here.
    await channel.messageEditor.pressSequentially("hello:smil");

    // Assert absence: give the suggestion plugin a fixed beat to (wrongly)
    // render before asserting it never did. A web-first toHaveCount(0) alone
    // would pass instantly at t=0, before a regression could open the dropdown.
    // eslint-disable-next-line playwright/no-wait-for-timeout -- justified negative-absence wait
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /slightly smiling face/i })).toHaveCount(0);
  });
});
