import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Mention tests.
 * @-mentions trigger userMentionExtension (char "@"), renders as <span class="mention-user">.
 * #-mentions trigger channelMentionExtension (char "#"), renders as <span class="mention-channel">.
 * Broadcast mentions (@channel / @here) render as <span class="mention-broadcast" data-broadcast="…">.
 *
 * The suggestion dropdown renders fixed-position <button> elements.
 * We use pressSequentially to dispatch real keyboard events so Tiptap's
 * suggestion plugin can intercept them.
 */
test.describe.serial("Mentions", () => {
  test("@user mention autocomplete → styled mention-user span in sent message", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();

    await channel.messageEditor.pressSequentially(`@${world.userName.slice(0, 3)}`);

    await expect(
      page.getByRole("button", { name: new RegExp(world.userName, "i") }).first(),
    ).toBeVisible({
      timeout: 6_000,
    });

    await page
      .getByRole("button", { name: new RegExp(world.userName, "i") })
      .first()
      .click();

    await channel.messageEditor.press("Enter");

    await expect(page.locator("main .mention-user").last()).toBeVisible({ timeout: 6_000 });
  });

  test("#channel mention autocomplete → styled mention-channel span in sent message", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();

    await channel.messageEditor.pressSequentially(`#${world.textChannelId.slice(0, 3)}`);

    await expect(
      page.getByRole("button", { name: new RegExp(world.textChannelId, "i") }).first(),
    ).toBeVisible({ timeout: 6_000 });

    await page
      .getByRole("button", { name: new RegExp(world.textChannelId, "i") })
      .first()
      .click();

    await channel.messageEditor.press("Enter");

    await expect(page.locator("main .mention-channel").last()).toBeVisible({ timeout: 6_000 });
  });
});

/**
 * Broadcast mention tests.
 *
 * The community's broadcastMentionMinRole defaults to "member", so any
 * authenticated member (including userPage) may broadcast. We use adminPage
 * (also a member) to keep the tests self-contained without relying on the
 * default not being overridden.
 *
 * Broadcast autocomplete items carry data-testid="mention-option-channel" /
 * "mention-option-here" (added to the SuggestionDropdown in MessageEditor.tsx).
 * Sent broadcast nodes render as <span class="mention-broadcast" data-broadcast="channel|here">.
 */
test.describe.serial("Broadcast mentions", () => {
  test("@channel broadcast autocomplete → styled mention-broadcast span in sent message", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();

    await channel.messageEditor.pressSequentially("@chan");

    await expect(page.getByTestId(testIds.mentionOptionChannel)).toBeVisible({ timeout: 6_000 });

    await page.getByTestId(testIds.mentionOptionChannel).click();

    await channel.messageEditor.press("Enter");

    await expect(
      page.locator('main .mention-broadcast[data-broadcast="channel"]').last(),
    ).toBeVisible({ timeout: 6_000 });
  });

  test("@here broadcast autocomplete → styled mention-broadcast span in sent message", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    await channel.messageEditor.click();

    await channel.messageEditor.pressSequentially("@here");

    await expect(page.getByTestId(testIds.mentionOptionHere)).toBeVisible({ timeout: 6_000 });

    await page.getByTestId(testIds.mentionOptionHere).click();

    await channel.messageEditor.press("Enter");

    await expect(page.locator('main .mention-broadcast[data-broadcast="here"]').last()).toBeVisible(
      { timeout: 6_000 },
    );
  });
});
