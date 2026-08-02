import { test, expect, authedPage } from "./worldFixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * "X is typing" indicator — two-user realtime flow with no prior coverage.
 * The composer pings the typing endpoint while the user types; other channel
 * members see the indicator via the container Mercure topic and it expires
 * on a client-side TTL after the pings stop.
 */
test.describe.serial("Typing indicator", () => {
  test("user typing in a channel is announced on another member's screen", async ({
    browser,
    world,
  }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId, {
        waitForMercure: true,
      });

      const editor = new ChannelPage(userPage).messageEditor;
      await editor.click();
      // pressSequentially (not fill) — real keystrokes drive the ping logic.
      await editor.pressSequentially("typing indicator probe", { delay: 60 });

      await expect(
        adminPage.locator("main").getByText(new RegExp(`${world.userName}.*typing`, "i")),
      ).toBeVisible({ timeout: 10_000 });

      // Indicator clears after the sender stops (client TTL).
      await expect(
        adminPage.locator("main").getByText(new RegExp(`${world.userName}.*typing`, "i")),
      ).toBeHidden({ timeout: 15_000 });
    } finally {
      await adminPage.context().close();
      await userPage.context().close();
    }
  });
});
