import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { T } from "./fixtures";

function messageRow(page: Page, text: string): Locator {
  return page.locator("[data-message-id]").filter({ hasText: text }).last();
}

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
    await expect(page.getByRole("button", { name: /👍/ }).first()).toBeVisible({
      timeout: T(6_000),
    });
  });

  test("toggle off a reaction → pill disappears", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    const channel = new ChannelPage(page);
    const text = `Reaction toggle ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);

    const pill = messageRow(page, text).getByRole("button", { name: /❤️/ });
    const removed = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && /\/reactions\/\d+$/.test(r.url()),
      { timeout: T(40_000) },
    );
    await channel.addReactionToLastMessage("❤️");
    await expect(pill.first()).toBeVisible({ timeout: T(6_000) });

    await pill.first().click();

    await expect(pill).toHaveCount(0, { timeout: T(6_000) });

    // The removal is sent only after the add confirms; reloading earlier cancels it.
    await removed;
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });
    await channel.expectMessage(text);
    await expect(messageRow(page, text).getByRole("button", { name: /❤️/ })).toHaveCount(0, {
      timeout: T(8_000),
    });
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
      { timeout: T(40_000) },
    );
    const removeResponse = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && /\/reactions\/\d+$/.test(r.url()),
      { timeout: T(40_000) },
    );
    await channel.addReactionToLastMessage("🎉");

    const pill = messageRow(page, text).getByRole("button", { name: /🎉/ });
    await expect(pill.first()).toBeVisible({ timeout: T(6_000) });
    await pill.first().click(); // clicked before the add resolves → existingId is 0

    await addResponse;
    await removeResponse;

    // Reload asserts server truth: old code dropped the click, leaving it stuck.
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });
    await channel.expectMessage(text);
    await expect(messageRow(page, text).getByRole("button", { name: /🎉/ })).toHaveCount(0, {
      timeout: T(8_000),
    });
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
    await expect(page.getByRole("button", { name: /👍/ }).first()).toBeVisible({
      timeout: T(6_000),
    });

    const pill = page.getByRole("button", { name: /👍/ }).first();
    await expect(pill).toBeVisible();
  });
});
