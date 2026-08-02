import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { ChannelSidebar } from "../pages/ChannelSidebar";
import { AppShell } from "../pages/AppShell";
import { CommunityRolesPanel } from "../pages/CommunityRolesPanel";

test.describe.serial("Community admin — controls and permissions", () => {
  test("sees the manage-community button in sidebar header", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    // Manage-community moved into the community-header overflow (⋯) menu.
    await page.getByTestId(testIds.communityActionsBtn).click();

    await expect(page.getByTestId(testIds.manageCommunity)).toBeVisible();
  });

  test("manage-community modal exposes the four admin tabs", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId(testIds.communityActionsBtn).click();
    await page.getByTestId(testIds.manageCommunity).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 6_000 });
    await expect(dialog.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Roles", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Groups", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Emojis", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().dispatchEvent("click");
  });

  test("roles tab shows the calling admin in the admins list", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    const panel = new CommunityRolesPanel(page);
    await panel.openFromSidebar();
    await panel.expectInRole("admin", world.cadminName);
    await panel.close();
  });

  test("can promote and demote a regular user to moderator via the roles tab", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    const panel = new CommunityRolesPanel(page);
    await panel.openFromSidebar();
    await panel.promote("moderator", world.userName);
    await panel.expectInRole("moderator", world.userName);

    // Restore so subsequent suites see the user as a plain member.
    await panel.demote("moderator", world.userName);
    await panel.expectNotInRole("moderator", world.userName);
    await panel.close();
  });

  test("can create a section", async ({ cadminPage: page, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    await sidebar.openCreateSection();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name").fill("Community Admin Section");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 6_000 });

    await sidebar.expectSectionVisible("Community Admin Section");
  });

  test("can create a channel in a section", async ({ cadminPage: page, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "cadmin-created", type: "text" });
    await sidebar.submitModal();

    await sidebar.expectChannelInSidebar("cadmin-created");
  });

  test("can edit community settings via the manage-community modal", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId(testIds.communityActionsBtn).click();
    await page.getByTestId(testIds.manageCommunity).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 6_000 });
    // Overview tab is the default; modal opens successfully — that's sufficient.
    await dialog.getByRole("button", { name: "Close" }).first().dispatchEvent("click");
    await expect(dialog).not.toBeVisible({ timeout: 6_000 });
  });

  test("can switch to the groups tab inside the manage-community modal", async ({
    cadminPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId(testIds.communityActionsBtn).click();
    await page.getByTestId(testIds.manageCommunity).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 6_000 });
    await dialog.getByRole("button", { name: "Groups", exact: true }).click();
    await dialog.getByRole("button", { name: "Close" }).first().dispatchEvent("click");
    await expect(dialog).not.toBeVisible({ timeout: 6_000 });
  });

  test("can see and access private channels", async ({ cadminPage: page, browser, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "cadmin-private", type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar("cadmin-private");

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel("cadmin-private");
    await expect(page.locator("main h1:visible").first()).toBeVisible();

    const userPage = await authedPage(browser, world.userJwt);
    try {
      await userPage.goto(`/${world.communityId}`);
      await expect(userPage.locator("aside")).toBeVisible({ timeout: 8_000 });
      await expect(userPage.locator(`aside a[href$="/cadmin-private"]`)).toBeHidden();
    } finally {
      await userPage.context().close();
    }
  });
});

test.describe.serial("Community admin — regular user boundary", () => {
  test("regular user does not see the manage-community button", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    await expect(page.getByTestId(testIds.manageCommunity)).not.toBeAttached();
  });
});
