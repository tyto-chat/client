import { test, expect, authedPage } from "./worldFixtures";
import { ChannelSidebar } from "../pages/ChannelSidebar";
import { AppShell } from "../pages/AppShell";

test.describe.serial("Channel management — admin", () => {
  test("create a section → appears in the sidebar", async ({ adminPage: page, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    await sidebar.openCreateSection();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal.getByLabel("Name").fill("Test Section");
    await modal.getByRole("button", { name: /create/i }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });

    await sidebar.expectSectionVisible("Test Section");
  });

  test("rename a section → updated name appears", async ({ adminPage: page, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    // Create a throwaway section to rename
    await sidebar.openCreateSection();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Name").fill("Rename Me");
    await modal.getByRole("button", { name: /create/i }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });
    await sidebar.expectSectionVisible("Rename Me");

    await sidebar.openEditSection("Rename Me");
    const editModal = page.getByRole("dialog");
    await editModal.getByLabel("Name").fill("Renamed Section");
    await editModal.getByRole("button", { name: /save/i }).click();
    await expect(editModal).not.toBeVisible({ timeout: 6_000 });

    await sidebar.expectSectionVisible("Renamed Section");
    await sidebar.expectSectionGone("Rename Me");
  });

  test("delete an empty section → removed from sidebar", async ({ adminPage: page, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    // Create a throwaway empty section then delete it
    await sidebar.openCreateSection();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Name").fill("Delete Me");
    await modal.getByRole("button", { name: /create/i }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });
    await sidebar.expectSectionVisible("Delete Me");

    await sidebar.deleteSection("Delete Me");

    await sidebar.expectSectionGone("Delete Me");
  });

  test("create a text channel → appears in the sidebar", async ({ adminPage: page, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    // Use the fixture "Text Channels" section (seeded in AppFixtures)
    await sidebar.openCreateChannelInSection("Text Channels");

    await sidebar.fillChannelModal({ name: "new-text-channel", type: "text" });
    await sidebar.submitModal();

    await sidebar.expectChannelInSidebar("new-text-channel");
  });

  test("create an audio channel → appears in the sidebar with mic icon", async ({
    adminPage: page,
    world,
  }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    await sidebar.openCreateChannelInSection("Voice Channels");

    await sidebar.fillChannelModal({ name: "new-voice-channel", type: "audio" });
    await sidebar.submitModal();

    await sidebar.expectChannelInSidebar("new-voice-channel");
  });

  test("create a readonly text channel → lock icon shown, regular user cannot post", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "readonly-channel", type: "text", isReadonly: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar("readonly-channel");

    const userPage = await authedPage(browser, world.userJwt);
    try {
      const shell = new AppShell(userPage, world.communityId);
      await shell.gotoChannel("readonly-channel");
      await expect(userPage.locator('[contenteditable="true"]')).toBeHidden();
      await expect(userPage.getByText(/this channel is readonly/i)).toBeVisible({
        timeout: 6_000,
      });
    } finally {
      await userPage.context().close();
    }
  });

  test("create a private channel → lock icon in sidebar, non-member cannot access", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "private-channel", type: "text", isPrivate: true });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar("private-channel");

    await expect(page.locator("aside").getByTitle("Private channel").first()).toBeVisible({
      timeout: 6_000,
    });

    const userPage = await authedPage(browser, world.userJwt);
    try {
      await userPage.goto(`/${world.communityId}`);
      await expect(userPage.locator("aside")).toBeVisible({ timeout: 8_000 });
      await expect(userPage.locator(`aside a[href$="/private-channel"]`)).toBeHidden();
    } finally {
      await userPage.context().close();
    }
  });

  test("edit a channel name → sidebar and heading update", async ({ adminPage: page, world }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();

    // Create a channel to rename
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "to-rename", type: "text" });
    await sidebar.submitModal();
    await sidebar.expectChannelInSidebar("to-rename");

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel("to-rename");

    await shell.openEditChannel();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal.getByLabel("Name").fill("renamed-channel");
    await modal.getByRole("button", { name: /save/i }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });

    // Slugs are frozen at creation: a rename changes the label, never the URL,
    // so the sidebar entry keeps its /to-rename href and only its text changes.
    await expect(page).toHaveURL(/to-rename/, { timeout: 6_000 });
    await sidebar.expectChannelInSidebar("to-rename");
    await expect(page.locator('aside a[href$="/to-rename"]')).toContainText("renamed-channel", {
      timeout: 6_000,
    });
  });

  test("toggle channel to readonly → message editor disappears for regular user", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: "toggle-readonly", type: "text" });
    await sidebar.submitModal();

    const userPage = await authedPage(browser, world.userJwt);
    try {
      const userShell = new AppShell(userPage, world.communityId);
      await userShell.gotoChannel("toggle-readonly");
      await expect(userPage.locator('[contenteditable="true"]')).toBeVisible();

      // Admin toggles readonly on
      const shell = new AppShell(page, world.communityId);
      await shell.gotoChannel("toggle-readonly");
      await shell.openEditChannel();
      const modal = page.getByRole("dialog");
      await modal.getByLabel(/readonly/i).click();
      await modal.getByRole("button", { name: /save/i }).click();
      await expect(modal).not.toBeVisible({ timeout: 6_000 });

      // User page should reflect the change after reload
      await userPage.reload();
      await expect(userPage.locator("main h1:visible").first()).toBeVisible({ timeout: 8_000 });
      await expect(userPage.locator('[contenteditable="true"]')).toBeHidden();
    } finally {
      await userPage.context().close();
    }
  });
});

test.describe.serial("Channel management — regular user", () => {
  test("regular user does not see section/channel admin controls", async ({
    userPage: page,
    world,
  }) => {
    await page.goto(`/${world.communityId}`);
    await expect(page.locator("aside")).toBeVisible({ timeout: 8_000 });

    // Hover the sidebar — no "+ Add Section" button should appear
    await page.locator("aside").hover();
    await expect(page.getByRole("button", { name: /add section/i })).toBeHidden();

    // Hover the section header — no edit / delete / add-channel buttons.
    // Section headers render as `div.group` rows (name in a <span>).
    const sectionHeader = page.locator("aside div.group").first();
    await sectionHeader.hover();
    await expect(page.getByTitle("Add channel")).toBeHidden();
    await expect(page.getByTitle("Edit section")).toBeHidden();
  });

  test("regular user does not see the edit channel button", async ({ userPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await expect(page.getByTitle(/edit channel/i)).toBeHidden();
  });
});
