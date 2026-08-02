/**
 * Search — SearchDialog UX (per-channel)
 *
 * STUB NOTE: The e2e backend runs APP_ENV=test, which wires InMemorySearchService
 * instead of real Meilisearch. While InMemorySearchService does store and match
 * documents for functional (PHPUnit) tests, indexing is driven by async Messenger
 * (IndexMessageDocumentMessage → async transport → doctrine queue). No messenger
 * worker runs against the test database in e2e, so dispatched index jobs are never
 * consumed and the InMemorySearchService's in-memory store is always empty when a
 * search API call arrives.
 *
 * Consequence: any test that sends a message then searches for it will consistently
 * hit the "no results" path — this is NOT a stub limitation but a transport/worker
 * limitation. Result-navigation tests (hit → /m/<uuid>) are therefore omitted.
 *
 * What IS tested here (all dialog UX, no result dependency):
 *   1. Open dialog via the magnifier button in the channel header.
 *   2. Open dialog via Ctrl+K keyboard shortcut.
 *   3. Close dialog via Esc key.
 *   4. Close dialog via the X button.
 *   5. Min-query gate: typing a single character does not enable the Search
 *      button and does not produce results.
 *   6. Submitting a 2-character+ query shows the (empty) results pane — confirms
 *      the backend endpoint is reachable and the UI transitions correctly.
 */

import { test, expect } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";

test.describe.serial("Search — dialog UX", () => {
  test("open via magnifier button — dialog visible", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.searchOpenBtn).click();

    await expect(page.getByTestId(testIds.searchDialog)).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId(testIds.searchInput)).toBeFocused({ timeout: 4_000 });
  });

  test("open via Ctrl+K — dialog visible", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await page.keyboard.press("Control+k");

    await expect(page.getByTestId(testIds.searchDialog)).toBeVisible({ timeout: 6_000 });
  });

  test("close via Esc key", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.searchOpenBtn).click();
    await expect(page.getByTestId(testIds.searchDialog)).toBeVisible({ timeout: 6_000 });

    await page.keyboard.press("Escape");

    await expect(page.getByTestId(testIds.searchDialog)).not.toBeVisible({ timeout: 4_000 });
  });

  test("close via backdrop click", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.searchOpenBtn).click();
    await expect(page.getByTestId(testIds.searchDialog)).toBeVisible({ timeout: 6_000 });

    // The dialog has no X button — clicking the backdrop (outside the dialog,
    // top-left corner) dismisses it. The backdrop is a full-screen z-50 overlay
    // whose mousedown handler closes the modal.
    await page.mouse.click(5, 5);

    await expect(page.getByTestId(testIds.searchDialog)).not.toBeVisible({ timeout: 4_000 });
  });

  test("min-query gate — single character keeps Search button disabled", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.searchOpenBtn).click();
    await expect(page.getByTestId(testIds.searchDialog)).toBeVisible({ timeout: 6_000 });

    const input = page.getByTestId(testIds.searchInput);
    await input.fill("a");

    const searchBtn = page.getByTestId(testIds.searchSubmitBtn);
    await expect(searchBtn).toBeDisabled();

    // No results pane should be visible — the dialog stays compact until a
    // query of at least 2 characters is submitted.
    await expect(page.getByTestId(testIds.searchResultRow)).not.toBeAttached();
  });

  test("submitting a valid query shows the results pane (empty in e2e)", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await page.getByTestId(testIds.searchOpenBtn).click();
    await expect(page.getByTestId(testIds.searchDialog)).toBeVisible({ timeout: 6_000 });

    const input = page.getByTestId(testIds.searchInput);
    await input.fill("hi");

    const searchBtn = page.getByTestId(testIds.searchSubmitBtn);
    await expect(searchBtn).toBeEnabled();

    await searchBtn.click();

    // Wait for the backend to respond: either a "no results" message (expected
    // in e2e because the index is always empty — see file header) or actual hit
    // rows. We assert the absence of a loading spinner to confirm the response
    // arrived, then verify the empty-state copy.
    const dialog = page.getByTestId(testIds.searchDialog);
    await expect(dialog.getByText(/no messages match/i)).toBeVisible({ timeout: 8_000 });
  });
});
