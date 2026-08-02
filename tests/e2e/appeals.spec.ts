/**
 * Moderation appeals — a warned member appeals, a moderator decides.
 *
 * `moderation.spec.ts` covers issuing actions; nothing covered the loop back:
 * the appeal button on the moderation notification, and the Appeals tab where a
 * moderator upholds or overturns.
 *
 * The warning is issued through the API so the spec starts at the interesting
 * part, and it targets a throwaway member so no fixture account carries a
 * moderation record into later specs.
 */

import { test, expect } from "./worldFixtures";
import { authedPage } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL } from "./fixtures";
import { WorldBuilder } from "./world/builder";
import { CommunitySettings } from "../pages/CommunitySettings";
import { testIds } from "./testIds";
import type { Page } from "@playwright/test";

let appellant: { jwt: string; name: string; email: string };

async function openAppealsTab(page: Page): Promise<void> {
  await new CommunitySettings(page).openTab("appeals");
}

test.describe.serial("Moderation appeals", () => {
  test.beforeAll(async ({ world }) => {
    // Seeding plus the notification poll below outlast the 20s default.
    test.setTimeout(60_000);

    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      // Unique per run: a retried beforeAll would otherwise create a second
      // account with the same display name, and findUserIdByName resolves the
      // older one — the warning would land on the wrong user.
      appellant = await wb.createMember(
        world.communityId,
        `Appeal Filer ${String(Date.now()).slice(-6)}`,
      );
      const userId = await wb.findUserIdByName(appellant.name);
      await wb.moderate(world.communityId, userId, "warn", "Spamming the general channel");
    } finally {
      await wb.dispose();
    }

    // Notifications are dispatched asynchronously — wait for the warn to land
    // before a test opens the bell looking for its Appeal button.
    const asAppellant = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, appellant.jwt);
    await asAppellant.init();
    try {
      await expect
        .poll(
          async () =>
            (await asAppellant.getCommunityNotifications(world.communityId)).some(
              (n) => n.type === "warn",
            ),
          { timeout: 20_000 },
        )
        .toBe(true);
    } finally {
      await asAppellant.dispose();
    }
  });

  test("the warned member files an appeal from the notification", async ({ browser, world }) => {
    const page = await authedPage(browser, appellant.jwt);
    try {
      await page.goto(`/${world.communityId}`);
      await page.getByTestId(testIds.notificationBell).click();

      const appealButton = page.getByRole("button", { name: "Appeal" });
      await expect(appealButton).toBeVisible({ timeout: 10_000 });
      await appealButton.click();

      const reason = page.getByPlaceholder("Why should this action be reconsidered?");
      await expect(reason).toBeVisible({ timeout: 8_000 });
      await reason.fill("It was a quote, not spam.");
      await expect(reason).toHaveValue("It was a quote, not spam.");

      const submit = page.getByRole("button", { name: "Submit appeal" });
      await expect(submit).toBeEnabled();
      await submit.click();

      // The success toast auto-dismisses; the modal closing is the stable signal,
      // and the next test proves the appeal actually landed.
      await expect(reason).toHaveCount(0, { timeout: 10_000 });
    } finally {
      await page.context().close();
    }
  });

  test("the appeal shows up pending for a moderator", async ({ adminPage: page, world }) => {
    await page.goto(`/${world.communityId}`);
    await openAppealsTab(page);

    await expect(page.getByText("It was a quote, not spam.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Spamming the general channel")).toBeVisible();
  });

  test("a moderator overturns the appeal and the action is lifted", async ({
    adminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await openAppealsTab(page);

    const card = page.getByTestId("appeal-card").filter({ hasText: "It was a quote, not spam." });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card
      .getByPlaceholder("Add a note explaining your decision (optional)")
      .fill("Reviewed — warning withdrawn.");
    await card.getByRole("button", { name: "Overturn & lift" }).click();

    await expect(page.getByText("Appeal granted — action lifted.")).toBeVisible({
      timeout: 10_000,
    });

    // Pending is the default filter, so the decided appeal leaves the list.
    await expect(
      page.getByTestId("appeal-card").filter({ hasText: "It was a quote, not spam." }),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
