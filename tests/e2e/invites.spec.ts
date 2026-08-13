/**
 * Community invites — generate a link, accept it, revoke it.
 *
 * Runs against a PRIVATE community created for this spec, because that is where
 * an invite actually carries authority: a public community can be joined without
 * one. The world's shared community stays untouched.
 *
 * `public-routes.spec.ts` already covers the invalid-token landing page; this
 * spec covers the paths that end in a real membership.
 */

import { test, expect } from "./worldFixtures";
import { authedPage } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { CommunitySettings } from "../pages/CommunitySettings";
import type { Page } from "@playwright/test";

let communityId: string;
let invitee: { jwt: string; name: string; email: string };
let secondInvitee: { jwt: string; name: string; email: string };
let inviteToken = "";

async function openInvitesTab(page: Page): Promise<void> {
  await new CommunitySettings(page).openTab("invites");
}

/**
 * Tokens currently listed. Read as a set rather than by row position: the list
 * is not ordered newest-last, and a retried test starts with whatever the failed
 * attempt already created.
 */
async function readTokens(page: Page): Promise<string[]> {
  const links = page.getByRole("button", { name: /\/invite\// });
  await expect(links.first()).toBeVisible({ timeout: T(8_000) });
  const texts = await links.allInnerTexts();
  return texts.map((text) => text.trim().split("/").pop() ?? "");
}

test.describe.serial("Community invites", () => {
  test.beforeAll(async ({ world }) => {
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      communityId = `invites-${world.communityId}`;
      if (!(await wb.communityExists(communityId))) {
        const community = await wb.createCommunity(communityId, { isPrivate: true });
        const section = await wb.createSection(communityId, "Text Channels");
        await wb.createChannel(
          community["@id"] as string,
          section["@id"] as string,
          `lobby-${world.communityId}`,
          "text",
        );
        await wb.joinCommunity(communityId);
      }
      invitee = await wb.createMember(world.communityId, "Invitee One");
      secondInvitee = await wb.createMember(world.communityId, "Invitee Two");
    } finally {
      await wb.dispose();
    }
  });

  test("admin generates an invite link for a private community", async ({ adminPage: page }) => {
    await page.goto(`/${communityId}`);
    await openInvitesTab(page);

    const links = page.getByRole("button", { name: /\/invite\// });
    const before = await links.count();
    // eslint-disable-next-line playwright/no-conditional-in-test -- readTokens waits for a visible row; empty state must short-circuit
    const knownTokens = before === 0 ? [] : await readTokens(page);

    await page.getByRole("button", { name: "Generate link" }).click();
    await expect(links).toHaveCount(before + 1, { timeout: T(8_000) });

    inviteToken = (await readTokens(page)).find((token) => !knownTokens.includes(token)) ?? "";
    expect(inviteToken.length).toBeGreaterThan(0);
    await expect(page.getByText("0 uses").first()).toBeVisible();
  });

  test("invited user accepts the link and lands in the community", async ({ browser }) => {
    const page = await authedPage(browser, invitee.jwt);
    try {
      await page.goto(`/invite/${inviteToken}`);

      await expect(page.getByRole("button", { name: "Join community" })).toBeVisible({
        timeout: T(10_000),
      });
      await page.getByRole("button", { name: "Join community" }).click();

      await expect(page).toHaveURL(new RegExp(`/${communityId}`), { timeout: T(10_000) });
    } finally {
      await page.context().close();
    }
  });

  test("the accepted invite records the use", async ({ adminPage: page }) => {
    await page.goto(`/${communityId}`);
    await openInvitesTab(page);

    const row = page.locator("li").filter({ hasText: inviteToken });
    await expect(row.getByText(/[1-9]\d* uses/)).toBeVisible({ timeout: T(8_000) });
  });

  test("a revoked invite no longer admits anyone", async ({ adminPage: page, browser }) => {
    await page.goto(`/${communityId}`);
    await openInvitesTab(page);

    const links = page.getByRole("button", { name: /\/invite\// });
    const knownTokens = await readTokens(page);

    await page.getByRole("button", { name: "Generate link" }).click();
    await expect(links).toHaveCount(knownTokens.length + 1, { timeout: T(8_000) });

    const freshToken = (await readTokens(page)).find((token) => !knownTokens.includes(token)) ?? "";
    expect(freshToken.length).toBeGreaterThan(0);

    const row = page.locator("li").filter({ hasText: freshToken });
    await row.getByTitle("Revoke").click();
    await expect(links).toHaveCount(knownTokens.length, { timeout: T(8_000) });

    const guest = await authedPage(browser, secondInvitee.jwt);
    try {
      await guest.goto(`/invite/${freshToken}`);
      await expect(guest.getByText("Invite unavailable")).toBeVisible({ timeout: T(10_000) });
      await expect(guest.getByRole("button", { name: "Join community" })).toHaveCount(0);
    } finally {
      await guest.context().close();
    }
  });
});
