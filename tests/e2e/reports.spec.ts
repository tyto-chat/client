import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Message reporting — end to end from the hover action to the admin inbox.
 * No prior e2e coverage of either side of the flow.
 */
test.describe.serial("Message reports", () => {
  test("regular user reports a message; global admin sees it in /admin/reports", async ({
    browser,
    world,
  }) => {
    // Admin authors the offending message.
    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);
    try {
      const reportedText = `Reportable message ${Date.now()}`;
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      await new ChannelPage(adminPage).sendMessage(reportedText);

      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      await new ChannelPage(userPage).expectMessage(reportedText);

      await userPage.locator("main .message-content").last().hover();
      const reportBtn = userPage.getByTestId(testIds.msgActionReport).last();
      await expect(reportBtn).toBeVisible({ timeout: 5_000 });
      await reportBtn.click();

      const dialog = userPage.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.locator("input[type='radio']").first().check();
      await dialog.getByRole("button", { name: /submit report/i }).click();
      await expect(userPage.getByText(/report submitted/i)).toBeVisible({ timeout: 8_000 });

      // Admin inbox lists the report: reported user is the admin, reporter shown.
      await adminPage.goto("/admin/reports");
      await expect(adminPage.getByText(world.userName, { exact: false }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });

  test("anonymous user sees no report action on messages", async ({ page, world }) => {
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await page.locator("main .message-content").last().hover();
    await expect(page.getByTestId(testIds.msgActionReport)).toHaveCount(0);
  });
});
