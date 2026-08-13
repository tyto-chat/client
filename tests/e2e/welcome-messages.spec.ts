/**
 * Welcome messages — the bot posts on join, and the system-message render path.
 *
 * System messages take a dedicated branch in MessageGroup: no avatar, no author
 * header, italic and centred, with the author stripped server-side. Only a
 * community admin may delete one.
 *
 * Requires a default bot: `WelcomeMessageService` silently no-ops when none is
 * configured, so beforeAll provisions one. The spec uses its own community so
 * the world's shared channels stay free of system messages.
 */

import { test, expect } from "./worldFixtures";
import { authedPage } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { CommunitySettings } from "../pages/CommunitySettings";

let communityId: string;
let channelId: string;
let joiner: { jwt: string; name: string; email: string };

test.describe.serial("Welcome messages", () => {
  test.beforeAll(async ({ world }) => {
    test.setTimeout(60_000);

    const stamp = String(Date.now()).slice(-6);
    communityId = `welcome-${stamp}`;
    channelId = `lobby-${stamp}`;

    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      await wb.ensureDefaultBot("Tyto Bot");

      const community = await wb.createCommunity(communityId);
      const section = await wb.createSection(communityId, "Text Channels");
      await wb.createChannel(
        community["@id"] as string,
        section["@id"] as string,
        channelId,
        "text",
      );
      await wb.joinCommunity(communityId);

      joiner = await wb.createMember(world.communityId, `Welcome Joiner ${stamp}`);
    } finally {
      await wb.dispose();
    }
  });

  test("an admin sets the welcome channel from community settings", async ({ adminPage: page }) => {
    await page.goto(`/${communityId}`);
    await new CommunitySettings(page).openTab("overview");

    // The label is a sibling <label>, not associated with the select.
    const select = page
      .locator("div")
      .filter({ has: page.getByText("Welcome channel", { exact: true }) })
      .last()
      .getByRole("combobox");
    await expect(select).toBeVisible({ timeout: T(8_000) });
    await select.selectOption({ label: `#${channelId}` });
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: T(10_000) });
  });

  test("joining posts a system welcome message rendered without an author", async ({ browser }) => {
    const page = await authedPage(browser, joiner.jwt);
    try {
      await page.goto(`/${communityId}`);
      await page.getByRole("button", { name: /join/i }).first().click();

      await page.goto(`/${communityId}/${channelId}`);

      const systemRow = page.locator("[data-message-id]").filter({ hasText: joiner.name });
      await expect(systemRow.first()).toBeVisible({ timeout: T(15_000) });

      // The mention renders through the normal pipeline, so the joiner's name is
      // a mention span rather than an author header.
      await expect(page.locator(".mention-user").first()).toBeVisible();
      await expect(page.getByTestId("msg-author-name")).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });

  test("a community admin can delete the system message", async ({ adminPage: page }) => {
    await page.goto(`/${communityId}/${channelId}`);

    const systemRow = page.locator("[data-message-id]").first();
    await expect(systemRow).toBeVisible({ timeout: T(10_000) });
    await systemRow.hover();

    // System messages carry their own trash affordance, not the standard hover bar.
    await page.getByTitle("Delete welcome message").click();

    // Soft delete: the row stays and becomes a tombstone.
    await expect(page.getByText("This message was deleted.")).toBeVisible({ timeout: T(10_000) });
  });
});
