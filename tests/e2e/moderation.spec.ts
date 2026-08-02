import { test, expect, authedPage } from "./worldFixtures";
import { testIds } from "./testIds";
import { WorldBuilder } from "./world/builder";
import { E2E_API_URL, E2E_BASE_URL } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";
import { ChannelSidebar } from "../pages/ChannelSidebar";
import { ModerationModal } from "../pages/ModerationModal";

/**
 * Create a throwaway community member: register + onboard + join via the API,
 * return their credentials. Use `authedPage(browser, member.jwt)` when a
 * browser session is also needed.
 */
async function createMember(
  communityId: string,
  name: string,
): Promise<{ jwt: string; name: string; email: string }> {
  // Use a stateless WorldBuilder (no JWT needed — createMember manages its own contexts)
  const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL);
  await wb.init();
  try {
    return await wb.createMember(communityId, name);
  } finally {
    await wb.dispose();
  }
}

test.describe.serial("Moderation — warn and timeout", () => {
  test("admin warns user — action applied, no active restriction shown", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    // World user sends a message so their name is clickable in chat
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      const warnMsg = `warn-target-${Date.now()}`;
      await new ChannelPage(userPage).sendMessage(warnMsg);
      await new ChannelPage(userPage).expectMessage(warnMsg);
    } finally {
      await userPage.context().close();
    }

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`warn-target-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(world.userName);
    await modal.goToActionsTab();

    // Warn does not create an active restriction
    await modal.applyAction("warn", { reason: "test warn" });
    await modal.expectActionSuccess();
    await modal.expectNoActiveActions();
    await modal.close();
  });

  test("admin timeouts user — Timed out badge appears in modal header", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      const timeoutMsg = `timeout-target-${Date.now()}`;
      await new ChannelPage(userPage).sendMessage(timeoutMsg);
      await new ChannelPage(userPage).expectMessage(timeoutMsg);
    } finally {
      await userPage.context().close();
    }

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`timeout-target-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(world.userName);
    await modal.goToActionsTab();

    await modal.applyAction("timeout", { reason: "spam test" });
    await modal.expectActionSuccess();
    await modal.expectStatusBadge("Timed out");
    await modal.close();
  });

  test("timed-out user's message send is rolled back", async ({ browser, world }) => {
    // World user (currently timed out) tries to send a message
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);

      const blockedMsg = `blocked-by-timeout-${Date.now()}`;

      const [response] = await Promise.all([
        userPage.waitForResponse(
          (r) => r.url().includes("/messages") && r.request().method() === "POST",
          { timeout: 8_000 },
        ),
        new ChannelPage(userPage).sendMessage(blockedMsg),
      ]);

      expect(response.status()).toBe(403);

      // Optimistic message is rolled back — no chat row carries the text. Scope
      // to message rows ([data-message-id]) rather than the whole page: on a
      // failed send the composer restores the typed text into its editor (so
      // the user doesn't lose it), which a page-wide getByText would match.
      await expect(
        userPage.locator("main [data-message-id]").filter({ hasText: blockedMsg }),
      ).toHaveCount(0, { timeout: 4_000 });
    } finally {
      await userPage.context().close();
    }
  });

  test("admin lifts timeout — user can post again", async ({ adminPage: page, browser, world }) => {
    // User has messages in the channel from the timeout test — click their name directly
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(world.userName);
    await modal.goToActionsTab();
    await modal.liftFirstActiveAction();
    await modal.expectNoStatusBadge();
    await modal.close();

    const userPage2 = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage2, world.communityId).gotoChannel(world.textChannelId);
      const postLiftMsg = `post-lift-${Date.now()}`;
      await new ChannelPage(userPage2).sendMessage(postLiftMsg);
      await new ChannelPage(userPage2).expectMessage(postLiftMsg);
    } finally {
      await userPage2.context().close();
    }
  });
});

test.describe.serial("Moderation — notes", () => {
  test("admin can add, edit, and delete a moderator note on a user", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      const noteTargetMsg = `note-target-${Date.now()}`;
      await new ChannelPage(userPage).sendMessage(noteTargetMsg);
      await new ChannelPage(userPage).expectMessage(noteTargetMsg);
    } finally {
      await userPage.context().close();
    }

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`note-target-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(world.userName);
    await modal.goToNotesTab();

    await modal.addNote("First note content");
    await modal.expectNote("First note content");

    await modal.editNote("First note content", "Edited note content");
    await modal.expectNote("Edited note content");
    await modal.expectNoteGone("First note content");

    await modal.deleteNote("Edited note content");
    await modal.expectNoteGone("Edited note content");
    await expect(modal.dialog.getByText("No notes yet.")).toBeVisible({ timeout: 4_000 });

    await modal.close();
  });
});

test.describe.serial("Moderation — log", () => {
  test("applied action appears in mod log with correct target, type, and active status", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      const logTargetMsg = `log-target-${Date.now()}`;
      await new ChannelPage(userPage).sendMessage(logTargetMsg);
      await new ChannelPage(userPage).expectMessage(logTargetMsg);
    } finally {
      await userPage.context().close();
    }

    // Admin applies a warn (non-expiring, stays in log indefinitely)
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`log-target-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(world.userName);
    await modal.goToActionsTab();
    await modal.applyAction("warn", { reason: "log test reason" });
    await modal.expectActionSuccess();
    await modal.close();

    await page.getByTestId(testIds.communityActionsBtn).click();
    await page.getByTestId(testIds.manageCommunity).click();

    const logDialog = page.getByRole("dialog");
    await expect(logDialog).toBeVisible({ timeout: 6_000 });
    await logDialog.getByRole("button", { name: "Moderation log", exact: true }).click();

    // Verify log entry: target name, type badge, actor name
    await expect(logDialog.getByText(world.userName).first()).toBeVisible({ timeout: 6_000 });
    await expect(logDialog.getByText("Warn").first()).toBeVisible({ timeout: 6_000 });
    await expect(logDialog.getByText("Admin User").first()).toBeVisible({ timeout: 6_000 });

    await logDialog.getByRole("button", { name: "Close" }).first().click();
    await expect(logDialog).not.toBeVisible({ timeout: 6_000 });
  });
});

test.describe.serial("Moderation — permission boundary", () => {
  test("regular user sees no Actions or Notes tabs when clicking another user", async ({
    userPage: page,
    browser,
    world,
  }) => {
    // Admin sends a message so regular user can click on their name
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      const adminMsg = `admin-perm-boundary-${Date.now()}`;
      await new ChannelPage(adminPage).sendMessage(adminMsg);
      await new ChannelPage(adminPage).expectMessage(adminMsg);
    } finally {
      await adminPage.context().close();
    }

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`admin-perm-boundary-`);

    // Admin User's span may contain a badge — use exact: false
    await page.locator("main").getByText("Admin User", { exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 6_000 });

    // No Actions or Notes tabs — canModerate is false for regular users
    await expect(dialog.getByRole("button", { name: "Actions" })).not.toBeAttached();
    await expect(dialog.getByRole("button", { name: "Notes" })).not.toBeAttached();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 6_000 });
  });

  test("regular user has no access to the manage-community button", async ({
    userPage: page,
    world,
  }) => {
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await page.locator("aside > div").first().hover();
    await expect(page.getByTestId(testIds.manageCommunity)).not.toBeAttached();
  });
});

test.describe.serial("Moderation — admin immunity", () => {
  test("action history section shows past actions for a user", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(world.textChannelId);
      const historyMsg = `history-test-${Date.now()}`;
      await new ChannelPage(userPage).sendMessage(historyMsg);
      await new ChannelPage(userPage).expectMessage(historyMsg);
    } finally {
      await userPage.context().close();
    }

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`history-test-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(world.userName);
    await modal.goToActionsTab();
    await modal.applyAction("warn", { reason: "history test reason" });
    await modal.expectActionSuccess();

    await expect(modal.dialog.getByText("Action History")).toBeVisible({ timeout: 6_000 });
    await expect(modal.dialog.getByText("history test reason").first()).toBeVisible({
      timeout: 6_000,
    });
    await expect(modal.dialog.getByText("Warn").first()).toBeVisible({ timeout: 6_000 });

    await modal.close();
  });

  test("cannot apply moderation action to a community admin — shows error", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    // Community admin sends a message
    const cadminPage = await authedPage(browser, world.cadminJwt);
    try {
      await new AppShell(cadminPage, world.communityId).gotoChannel(world.textChannelId);
      const immuneMsg = `immune-target-${Date.now()}`;
      await new ChannelPage(cadminPage).sendMessage(immuneMsg);
      await new ChannelPage(cadminPage).expectMessage(immuneMsg);
    } finally {
      await cadminPage.context().close();
    }

    // Admin tries to ban community admin
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`immune-target-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(world.cadminName);
    await modal.goToActionsTab();
    await modal.applyAction("ban");
    await modal.expectActionError();
    await modal.close();
  });
});

test.describe.serial("Moderation — channel mod scoped actions", () => {
  test("channel mod sees only Timeout button and channel scope hint", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    // Admin creates a dedicated channel and adds the world user as moderator
    const sidebar = new ChannelSidebar(page, world.communityId);
    await sidebar.goto();
    await sidebar.openCreateChannelInSection("Text Channels");
    await sidebar.fillChannelModal({ name: `mod-scope-ch-${world.communityId}`, type: "text" });
    await sidebar.submitModal();
    const modScopeCh = `mod-scope-ch-${world.communityId}`;
    await sidebar.expectChannelInSidebar(modScopeCh);

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(modScopeCh);
    await shell.openManageChannelAccess();
    const accessModal = page.getByRole("dialog");
    await expect(accessModal).toBeVisible({ timeout: 6_000 });
    await accessModal.getByRole("textbox").first().fill(world.userName);
    await expect(accessModal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });
    await accessModal
      .getByRole("listitem")
      .filter({ hasText: world.userName })
      .getByRole("button", { name: "Add as mod" })
      .click();
    await expect(accessModal.getByText(world.userName)).toBeVisible({ timeout: 6_000 });
    await accessModal.getByRole("button", { name: "Close" }).click();
    await expect(accessModal).not.toBeVisible({ timeout: 6_000 });

    // Admin sends a message so channel mod has a target to click
    const targetMsg = `scope-target-${Date.now()}`;
    await new ChannelPage(page).sendMessage(targetMsg);
    await new ChannelPage(page).expectMessage(targetMsg);

    // World user (channel mod) opens the modal on Admin User
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(modScopeCh);
      await new ChannelPage(userPage).expectMessage(targetMsg);

      const dialog = userPage.getByRole("dialog");
      await userPage.locator("main").getByText("Admin User", { exact: false }).first().click();
      await expect(dialog).toBeVisible({ timeout: 6_000 });
      await dialog.getByRole("button", { name: "Actions" }).click();

      await expect(dialog.getByRole("button", { name: "Warn" })).not.toBeAttached();
      await expect(dialog.getByRole("button", { name: "Ban" })).not.toBeAttached();
      await expect(dialog.getByRole("button", { name: "Timeout" })).toBeVisible();

      // Channel scope hint shows the current channel identifier
      await expect(dialog.getByText(`#${modScopeCh}`)).toBeVisible();

      await dialog.getByRole("button", { name: "Close" }).click();
    } finally {
      await userPage.context().close();
    }
  });

  test("channel mod timeout succeeds (channel-scoped) and Lift button is shown", async ({
    browser,
    world,
  }) => {
    const modScopeCh = `mod-scope-ch-${world.communityId}`;

    // Create a fresh victim so global admin is not the target (admin is immune)
    const victim = await createMember(world.communityId, `Scope Victim ${world.communityId}`);

    const victimPage = await authedPage(browser, victim.jwt);
    try {
      await new AppShell(victimPage, world.communityId).gotoChannel(modScopeCh);
      const victimMsg = `scope-victim-msg-${Date.now()}`;
      await new ChannelPage(victimPage).sendMessage(victimMsg);
      await new ChannelPage(victimPage).expectMessage(victimMsg);
    } finally {
      await victimPage.context().close();
    }

    // World user (channel mod) applies a channel-scoped timeout on victim
    const userPage = await authedPage(browser, world.userJwt);
    try {
      await new AppShell(userPage, world.communityId).gotoChannel(modScopeCh);
      await new ChannelPage(userPage).expectMessage(`scope-victim-msg-`);

      const dialog = userPage.getByRole("dialog");
      await userPage.locator("main").getByText(victim.name, { exact: true }).first().click();
      await expect(dialog).toBeVisible({ timeout: 6_000 });
      await dialog.getByRole("button", { name: "Actions" }).click();
      await dialog.getByRole("button", { name: "Timeout" }).click();
      await dialog.getByRole("button", { name: "Apply" }).click();
      await expect(userPage.getByText("Action applied.")).toBeVisible({ timeout: 6_000 });

      await expect(dialog.getByRole("button", { name: "Lift" })).toBeVisible({ timeout: 6_000 });

      // Lift it so victim is no longer timed out in this channel
      await dialog.getByRole("button", { name: "Lift" }).click();
      await expect(userPage.getByText("Restriction lifted.")).toBeVisible({ timeout: 6_000 });

      await dialog.getByRole("button", { name: "Close" }).click();
    } finally {
      await userPage.context().close();
    }
  });

  test("admin removes world user from channel mod role", async ({ adminPage: page, world }) => {
    const modScopeCh = `mod-scope-ch-${world.communityId}`;
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(modScopeCh);
    await shell.openManageChannelAccess();
    const accessModal = page.getByRole("dialog");
    await expect(accessModal).toBeVisible({ timeout: 6_000 });
    await accessModal.getByRole("button", { name: "Remove mod" }).click();
    await expect(accessModal.getByText("No moderators yet.")).toBeVisible({ timeout: 6_000 });
    await accessModal.getByRole("button", { name: "Close" }).click();
    await expect(accessModal).not.toBeVisible({ timeout: 6_000 });
  });
});

test.describe.serial("Moderation — permanent ban", () => {
  test("Bans tab shows only bans; All tab shows all action types", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    // Create a fresh victim so world user's community membership stays intact
    const tabVictim = await createMember(world.communityId, `Tab Victim ${world.communityId}`);

    // Tab Victim sends a message so their name is clickable in chat
    const tabVictimPage = await authedPage(browser, tabVictim.jwt);
    try {
      await new AppShell(tabVictimPage, world.communityId).gotoChannel(world.textChannelId);
      const tabTestMsg = `tab-test-${Date.now()}`;
      await new ChannelPage(tabVictimPage).sendMessage(tabTestMsg);
      await new ChannelPage(tabVictimPage).expectMessage(tabTestMsg);
    } finally {
      await tabVictimPage.context().close();
    }

    // Admin applies a warn (non-ban) and a ban on Tab Victim
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`tab-test-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(tabVictim.name);
    await modal.goToActionsTab();
    await modal.applyAction("warn", { reason: "tab filter warn" });
    await modal.expectActionSuccess();
    await modal.close();

    await modal.openForUserInChat(tabVictim.name);
    await modal.goToActionsTab();
    await modal.applyAction("ban", { reason: "tab filter ban" });
    await modal.expectActionSuccess();
    await modal.close();

    await page.getByTestId(testIds.communityActionsBtn).click();
    await page.getByTestId(testIds.manageCommunity).click();
    const logDialog = page.getByRole("dialog");
    await expect(logDialog).toBeVisible({ timeout: 6_000 });
    await logDialog.getByRole("button", { name: "Moderation log", exact: true }).click();

    // "All" tab (default) — both Warn and Ban entries visible
    await expect(logDialog.getByRole("button", { name: "All" })).toBeVisible();
    await expect(logDialog.getByTestId(testIds.modlogRowWarn).first()).toBeVisible({
      timeout: 6_000,
    });
    await expect(logDialog.getByTestId(testIds.modlogRowBan).first()).toBeVisible({
      timeout: 6_000,
    });

    // Switch to "Bans" tab — wait for the API response to settle, then verify only bans
    const [bansResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/moderation") && r.url().includes("type=ban"), {
        timeout: 8_000,
      }),
      logDialog.getByRole("button", { name: "Bans" }).click(),
    ]);
    await bansResponse.finished();
    await expect(logDialog.getByTestId(testIds.modlogRowBan).first()).toBeVisible({
      timeout: 6_000,
    });
    await expect(logDialog.getByTestId(testIds.modlogRowWarn)).toHaveCount(0, { timeout: 4_000 });

    await logDialog.getByRole("button", { name: "Close" }).click();
    await expect(logDialog).not.toBeVisible({ timeout: 6_000 });
  });

  test("admin permanently bans a user — Banned badge shown with no expiry", async ({
    adminPage: page,
    browser,
    world,
  }) => {
    // Create a fresh victim specifically for the ban test so world user stays intact
    const banVictim = await createMember(world.communityId, `Ban Victim ${world.communityId}`);

    // Victim sends a message so their name is clickable
    const victimPage = await authedPage(browser, banVictim.jwt);
    try {
      await new AppShell(victimPage, world.communityId).gotoChannel(world.textChannelId);
      const banMsg = `ban-victim-msg-${Date.now()}`;
      await new ChannelPage(victimPage).sendMessage(banMsg);
      await new ChannelPage(victimPage).expectMessage(banMsg);
    } finally {
      await victimPage.context().close();
    }

    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await new ChannelPage(page).expectMessage(`ban-victim-msg-`);
    const modal = new ModerationModal(page);
    await modal.openForUserInChat(banVictim.name);
    await modal.goToActionsTab();
    await modal.applyAction("ban", { reason: "permanent ban test" });
    await modal.expectActionSuccess();

    // Banned badge appears; permanent ban has no expiry text
    await modal.expectStatusBadge("Banned");
    await expect(modal.dialog.getByText("expires", { exact: false })).toBeHidden();

    await modal.close();
  });
});
