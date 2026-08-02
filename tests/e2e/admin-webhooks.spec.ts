/**
 * Admin webhooks — create, secret reveal, active toggle, deliveries, delete.
 *
 * Each test creates its own webhook and removes it again, so a retried or
 * partially failed run cannot leave rows behind for the next spec on the worker.
 *
 * Delivery *dispatch* is not asserted: outbound HTTP is queued through messenger
 * and no worker consumes the async transport against the e2e database, so the
 * deliveries table is only ever exercised in its empty state here.
 */

import { test, expect } from "./worldFixtures";
import type { Page } from "@playwright/test";

const CREATE = "Create webhook";

async function createWebhook(page: Page, name: string): Promise<void> {
  await page.goto("/admin/webhooks");
  await page.getByRole("button", { name: CREATE }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  await dialog.getByPlaceholder("e.g. Slack notifications").fill(name);
  await dialog.getByPlaceholder("https://example.com/webhook").fill("https://example.com/hook");
  await expect(dialog.locator("select").first()).not.toHaveValue("", { timeout: 8_000 });
  await dialog.getByRole("button", { name: CREATE }).click();
}

async function deleteWebhook(page: Page, name: string): Promise<void> {
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0, { timeout: 8_000 });
}

test.describe.serial("Admin webhooks", () => {
  test("creating a webhook reveals its signing secret once, then lists it", async ({
    adminPage: page,
  }) => {
    const name = `Hook create ${String(Date.now()).slice(-6)}`;
    await createWebhook(page, name);

    await expect(page.getByText("Signing secret")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible({ timeout: 8_000 });

    // The secret is shown exactly once — reopening the webhook must not surface it.
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "View" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Signing secret")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();

    await deleteWebhook(page, name);
  });

  test("the active toggle persists across a reload", async ({ adminPage: page }) => {
    const name = `Hook toggle ${String(Date.now()).slice(-6)}`;
    await createWebhook(page, name);
    await page.getByRole("button", { name: "Done" }).click();

    const row = page.getByRole("row").filter({ hasText: name });
    const toggle = row.getByRole("switch");
    await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 8_000 });

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: 8_000 });

    await page.reload();
    const reloadedRow = page.getByRole("row").filter({ hasText: name });
    await expect(reloadedRow.getByRole("switch")).toHaveAttribute("aria-checked", "false", {
      timeout: 10_000,
    });

    await deleteWebhook(page, name);
  });

  test("the deliveries view opens and reports an empty history", async ({ adminPage: page }) => {
    const name = `Hook deliveries ${String(Date.now()).slice(-6)}`;
    await createWebhook(page, name);
    await page.getByRole("button", { name: "Done" }).click();

    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("button", { name: "Deliveries" })
      .click();

    await expect(page.getByText("No deliveries recorded yet.")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    await deleteWebhook(page, name);
  });
});
