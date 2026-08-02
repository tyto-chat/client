import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";

async function openEmojisTab(page: import("@playwright/test").Page, communityId: string) {
  await page.goto(`/${communityId}`);
  await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });
  await page.getByTestId(testIds.communityActionsBtn).click();
  await page.getByTestId(testIds.manageCommunity).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });
  await dialog.getByRole("button", { name: "Emojis", exact: true }).click();
  return dialog;
}

test.describe.serial("Community emoji manager — admin", () => {
  test("sees the manage-community button in sidebar admin row", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });
    await page.getByTestId(testIds.communityActionsBtn).click();

    await expect(page.getByTestId(testIds.manageCommunity)).toBeVisible();
  });

  test("emojis tab opens to an empty list for newly created communities", async ({
    cadminPage: page,
    world,
  }) => {
    const dialog = await openEmojisTab(page, world.communityId);

    // Test world is seeded fresh per-run with no community emojis.
    await expect(dialog.getByText(/No emojis yet\./i)).toBeVisible({ timeout: 4_000 });

    await dialog.getByRole("button", { name: "Close" }).first().dispatchEvent("click");
  });

  test("emojis tab shows the custom-emoji upload form", async ({ cadminPage: page, world }) => {
    const dialog = await openEmojisTab(page, world.communityId);

    // Unicode emojis are added straight from the picker; the only thing the
    // manager curates is custom-image uploads.
    await expect(dialog.getByLabel("Shortcode").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Upload", exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).first().dispatchEvent("click");
  });
});

test.describe.serial("Community emoji manager — regular user boundary", () => {
  test("regular user does not see the manage-community button", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await expect(page.getByTestId(testIds.manageCommunity)).not.toBeAttached();
  });
});
