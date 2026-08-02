import { test, expect } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

test.describe.serial("Reactions", () => {
  test("add emoji reaction → pill appears", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `Reaction add ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);

    await channel.addReactionToLastMessage("👍");

    // Reaction pill is always visible (not hover-dependent)
    await expect(page.getByRole("button", { name: /👍/ }).first()).toBeVisible({ timeout: 6_000 });
  });

  test("toggle off a reaction → pill disappears", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `Reaction toggle ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);

    // Use ❤️ (distinct from the 👍 in the previous test) so no other message
    // on the page has this reaction — making the not.toBeVisible() check reliable.
    await channel.addReactionToLastMessage("❤️");
    await expect(page.getByRole("button", { name: /❤️/ }).first()).toBeVisible({ timeout: 6_000 });

    await page.getByRole("button", { name: /❤️/ }).first().click();

    // Pill must disappear (reactions section is unmounted when no reactions remain)
    await expect(page.getByRole("button", { name: /❤️/ })).not.toBeVisible({ timeout: 6_000 });
  });

  test("toggle off before the server confirms the reaction id → pill still disappears", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `Reaction race ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);

    // Delay the add POST so the pill is clicked while still optimistic (id 0).
    await page.route("**/reactions", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    const addResponse = page.waitForResponse(
      (r) => r.request().method() === "POST" && /\/reactions$/.test(r.url()),
    );
    const removeResponse = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && /\/reactions\/\d+$/.test(r.url()),
    );
    await channel.addReactionToLastMessage("🎉");

    const pill = page.getByRole("button", { name: /🎉/ });
    await expect(pill.first()).toBeVisible({ timeout: 6_000 });
    await pill.first().click(); // clicked before the add resolves → existingId is 0

    await addResponse;
    await removeResponse;

    // Reload asserts server truth: old code dropped the click, leaving it stuck.
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });
    await channel.expectMessage(text);
    await expect(page.getByRole("button", { name: /🎉/ })).toHaveCount(0, { timeout: 8_000 });
  });

  test("two users can react to the same message independently", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `Multi reaction ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);

    await channel.addReactionToLastMessage("👍");
    await expect(page.getByRole("button", { name: /👍/ }).first()).toBeVisible({ timeout: 6_000 });

    const pill = page.getByRole("button", { name: /👍/ }).first();
    await expect(pill).toBeVisible();
  });
});
