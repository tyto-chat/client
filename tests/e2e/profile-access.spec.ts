import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Role-based access to the user-profile modal opened by clicking a message
 * author's name. Anonymous visitors must get NO modal and NO authenticated
 * request — /api/users/{id} requires auth and used to 401 when the click
 * handler was passed unconditionally.
 */
test.describe.serial("Profile modal — role access", () => {
  test.beforeAll(async ({ browser, world }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      await new ChannelPage(adminPage).sendMessage(`Profile access seed ${Date.now()}`);
    } finally {
      await adminPage.context().close();
    }
  });

  test("anonymous: author name is inert — no modal, no 401", async ({ page, world }) => {
    const unauthorized: string[] = [];
    page.on("response", (res) => {
      // /token/refresh 401s during the normal anonymous bootstrap — only the
      // profile fetch matters here.
      if (res.status() === 401 && /\/users\//.test(res.url())) unauthorized.push(res.url());
    });

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);

    const name = page.locator("main").getByTestId(testIds.msgAuthorName).last();
    await expect(name).toBeVisible({ timeout: 8_000 });
    await name.click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(unauthorized).toEqual([]);
  });

  test("regular user: clicking the author name opens the profile modal", async ({
    userPage: page,
    world,
  }) => {
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);

    const name = page.locator("main").getByTestId(testIds.msgAuthorName).last();
    await expect(name).toBeVisible({ timeout: 8_000 });
    await name.click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 8_000 });
  });

  test("anonymous: clicking the author avatar is also inert", async ({ page, world }) => {
    const unauthorized: string[] = [];
    page.on("response", (res) => {
      // /token/refresh 401s during the normal anonymous bootstrap — only the
      // profile fetch matters here.
      if (res.status() === 401 && /\/users\//.test(res.url())) unauthorized.push(res.url());
    });

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);

    const avatar = page.locator("main [data-testid='avatar']").last();
    await expect(avatar).toBeVisible({ timeout: 8_000 });
    await avatar.click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(unauthorized).toEqual([]);
  });
});
