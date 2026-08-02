/**
 * Reordering sections and channels.
 *
 * dnd-kit is driven through its KEYBOARD sensor (Space to grab, Arrow to move,
 * Space to drop) rather than synthetic mouse drags: it is deterministic, and it
 * doubles as proof the list is operable without a pointer.
 *
 * The spec seeds its own section with three channels and reorders inside it, so
 * the world's shared sidebar keeps its order for other specs.
 */

import { test, expect } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { testIds } from "./testIds";
import type { Page } from "@playwright/test";

let sectionName: string;
let channelNames: string[] = [];

async function openSectionMenu(page: Page, section: string): Promise<void> {
  await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });
  const header = page.locator("aside").getByRole("button", { name: section, exact: true });
  await expect(header).toBeVisible({ timeout: 8_000 });
  await header.hover();
  await header.locator("..").getByRole("button", { name: "More" }).click();
}

/** Grab the row, move it one slot with the arrow key, drop it. */
async function moveRow(
  page: Page,
  label: string,
  direction: "ArrowUp" | "ArrowDown",
): Promise<void> {
  const handle = page
    .getByTestId(testIds.sortableRow)
    .filter({ hasText: label })
    .getByRole("button", { name: "Drag to reorder" });
  // dnd-kit applies each step asynchronously; pressing straight through drops
  // the move. Its screen-reader live region is the signal that a step landed.
  // dnd-kit moves by transform and only rewrites the DOM on drop, so between
  // keystrokes there is nothing in the DOM to await: the pre-drop state is
  // identical whether or not the arrow key was applied. Its live-region text is
  // the only other signal and its wording is version-specific. A short settle
  // per keystroke is the honest option here.
  /* eslint-disable playwright/no-wait-for-timeout */
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press(direction);
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  /* eslint-enable playwright/no-wait-for-timeout */
}

async function rowOrder(page: Page): Promise<string[]> {
  return (await page.getByTestId(testIds.sortableRow).allInnerTexts()).map((t) => t.trim());
}

test.describe.serial("Reordering", () => {
  test.beforeAll(async ({ world }) => {
    test.setTimeout(60_000);

    const stamp = String(Date.now()).slice(-6);
    sectionName = `Reorder ${stamp}`;
    channelNames = [`ro-a-${stamp}`, `ro-b-${stamp}`, `ro-c-${stamp}`];

    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      const community = await wb.getCommunity(world.communityId);
      const section = await wb.createSection(world.communityId, sectionName);
      for (const name of channelNames) {
        await wb.createChannel(community["@id"] as string, section["@id"] as string, name, "text");
      }
    } finally {
      await wb.dispose();
    }
  });

  test("channels within a section can be reordered from the keyboard", async ({
    adminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await openSectionMenu(page, sectionName);
    await page.getByRole("menuitem", { name: "Reorder channels" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    expect(await rowOrder(page)).toEqual(channelNames);

    await moveRow(page, channelNames[0]!, "ArrowDown");
    expect(await rowOrder(page)).toEqual([channelNames[1]!, channelNames[0]!, channelNames[2]!]);

    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
  });

  test("the new channel order survives a reload", async ({ adminPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await openSectionMenu(page, sectionName);
    await page.getByRole("menuitem", { name: "Reorder channels" }).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 8_000 });
    expect(await rowOrder(page)).toEqual([channelNames[1]!, channelNames[0]!, channelNames[2]!]);
  });

  test("sections can be reordered and the order persists", async ({ adminPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    // Section ordering lives in the community header menu, not the section's own.
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });
    await page.getByTestId(testIds.communityActionsBtn).click();
    await page.getByRole("menuitem", { name: "Reorder sections" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    const before = await rowOrder(page);
    expect(before.length).toBeGreaterThan(1);

    await moveRow(page, before.at(-1)!, "ArrowUp");
    const moved = await rowOrder(page);
    expect(moved).not.toEqual(before);

    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    await page.reload();
    // Section ordering lives in the community header menu, not the section's own.
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });
    await page.getByTestId(testIds.communityActionsBtn).click();
    await page.getByRole("menuitem", { name: "Reorder sections" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 8_000 });
    expect(await rowOrder(page)).toEqual(moved);
  });
});
