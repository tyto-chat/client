import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { T } from "./fixtures";

test.describe.serial("Role visibility — anonymous user", () => {
  test.beforeAll(async ({ browser, world }) => {
    // Ensure at least one message exists so hover-dependent tests work in isolation.
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      await new ChannelPage(adminPage).sendMessage(`Role visibility seed ${Date.now()}`);
    } finally {
      await adminPage.context().close();
    }
  });

  test.beforeEach(async ({ page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
  });

  test("anonymous user does not see notification bell", async ({ page }) => {
    await expect(page.getByTitle(/notifications/i)).toBeHidden();
  });

  test("anonymous user does not see channel creation button", async ({ page }) => {
    await expect(page.getByTitle(/add channel/i)).toBeHidden();
  });

  test("anonymous user does not see Add reaction button", async ({ page }) => {
    // canReact=false for anonymous — no Add reaction button rendered in the DOM at all
    await page.locator("main .message-content").last().hover();
    await expect(page.getByTestId(testIds.msgActionReact)).toHaveCount(0);
  });

  test("anonymous user does not see community settings button", async ({ page }) => {
    await expect(page.getByTitle(/community settings/i)).toBeHidden();
  });

  test("anonymous user does not see Edit or Delete on hover", async ({ page, browser, world }) => {
    // Need a message to hover — send one via admin context first
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      const msgText = `Anon hover ${Date.now()}`;
      await new ChannelPage(adminPage).sendMessage(msgText);
      await new ChannelPage(adminPage).expectMessage(msgText);
    } finally {
      await adminPage.context().close();
    }

    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });
    await page.locator("main .message-content").last().hover();
    await expect(page.getByTestId(testIds.msgActionEdit)).not.toBeVisible({ timeout: T(3_000) });
    await expect(page.getByTestId(testIds.msgActionDelete)).not.toBeVisible({ timeout: T(3_000) });
  });
});

test.describe.serial("Role visibility — regular user", () => {
  test.beforeEach(async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
  });

  test("regular user does not see community settings button", async ({ userPage: page }) => {
    await expect(page.getByTitle(/community settings/i)).toBeHidden();
  });

  test("regular user does not see channel creation button", async ({ userPage: page }) => {
    await expect(page.getByTitle(/add channel/i)).toBeHidden();
  });

  test("regular user does not see Make mod button in public channel", async ({
    userPage: page,
  }) => {
    // Hover a message — no member management controls visible outside private channel modals
    const channel = new ChannelPage(page);
    const text = `User vis ${Date.now()}`;
    await channel.sendMessage(text);
    await channel.expectMessage(text);
    await page.locator("main .message-content").last().hover();
    await expect(page.getByTitle(/make mod/i)).not.toBeVisible({ timeout: T(3_000) });
  });

  test("regular user sees Edit and Delete only on own messages", async ({
    userPage: page,
    browser,
    world,
  }) => {
    const channel = new ChannelPage(page);
    const ownText = `Own msg ${Date.now()}`;
    await channel.sendMessage(ownText);
    await channel.expectMessage(ownText);

    // Own message: Edit + Delete appear on hover — scoped to that message's row
    // (each [data-message-id] row renders its own action bar), not a global
    // `.last()` that can resolve to another message's button. Hover the message
    // content, not the whole row: the row's lower edge sits under the floating
    // composer overlay, which would intercept the pointer.
    const ownRow = page.locator("main [data-message-id]").filter({ hasText: ownText }).last();
    await ownRow.locator(".message-content").first().hover();
    await expect(ownRow.getByTestId(testIds.msgActionEdit)).toBeVisible({ timeout: T(5_000) });
    await expect(ownRow.getByTestId(testIds.msgActionDelete)).toBeVisible({ timeout: T(5_000) });

    const adminText = `Admin msg ${Date.now()}`;
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      await new ChannelPage(adminPage).sendMessage(adminText);
      await new ChannelPage(adminPage).expectMessage(adminText);
    } finally {
      await adminPage.context().close();
    }

    // Regular user reloads and waits for the admin message. A non-owner's row
    // never renders Edit/Delete controls, so they are absent from the DOM —
    // assert that directly (no hover, no visibility race).
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });
    const adminRow = page.locator("main [data-message-id]").filter({ hasText: adminText }).last();
    await expect(adminRow).toBeVisible({ timeout: T(10_000) });
    await expect(adminRow.getByTestId(testIds.msgActionEdit)).toHaveCount(0);
    await expect(adminRow.getByTestId(testIds.msgActionDelete)).toHaveCount(0);
  });
});

test.describe.serial("Role visibility — admin user", () => {
  test.beforeEach(async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
  });

  test("admin sees channel creation button", async ({ adminPage: page }) => {
    // "Add channel" moved into the section header's overflow (⋯) menu, which is
    // revealed on hover. Open it and assert the menu item is reachable.
    const section = page
      .locator("aside div.group")
      .filter({ has: page.getByTestId(testIds.sectionActionsBtn) })
      .first();
    await section.hover();
    await section.getByTestId(testIds.sectionActionsBtn).click({ force: true });
    await expect(page.getByRole("menuitem", { name: /add channel/i })).toBeVisible({
      timeout: T(6_000),
    });
  });

  test("admin sees Edit and Delete on any message", async ({ adminPage: page, browser, world }) => {
    const msgText = `User msg for admin ${Date.now()}`;
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      await new ChannelPage(userPage).sendMessage(msgText);
      await new ChannelPage(userPage).expectMessage(msgText);
    } finally {
      await userPage.context().close();
    }

    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: T(10_000) });

    // Scoped to the message under test, not to whatever is last: the new message
    // can render between the two assertions, which moves `.last()` onto a row
    // that was never hovered and whose action bar is therefore hidden.
    // data-message-id is on both the group wrapper and the individual row; the
    // inner row is the one that owns the hover state and the action bar.
    const row = page.locator("main [data-message-id]").filter({ hasText: msgText }).last();
    await expect(row).toBeVisible({ timeout: T(10_000) });
    await row.locator(".message-content").hover();

    await expect(row.getByTestId(testIds.msgActionEdit)).toBeVisible({ timeout: T(5_000) });
    await expect(row.getByTestId(testIds.msgActionDelete)).toBeVisible({ timeout: T(5_000) });
  });

  test("admin does not see guest prompt in text channel", async ({ adminPage: page }) => {
    await expect(page.getByText(/sign in to chat/i)).toBeHidden();
  });
});
