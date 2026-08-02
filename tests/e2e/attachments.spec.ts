import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { test, expect, authedPage } from "./worldFixtures";
import { E2E_API_URL } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import { ChannelPage } from "../pages/ChannelPage";

/**
 * Create a small temporary file for upload tests.
 * Returns the file path — caller is responsible for cleanup.
 */
function createTempFile(name: string, content: string): string {
  const filePath = path.join(os.tmpdir(), name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Enable or disable allowAttachments on the given channel via the API.
 * Requires a valid admin JWT obtained from the page's localStorage.
 */
async function setAllowAttachments(
  page: import("@playwright/test").Page,
  communityId: string,
  channelId: string,
  allow: boolean,
): Promise<void> {
  const jwt = (await page.evaluate(
    () => (window as unknown as { __TYTO_DEV_TOKEN__?: string }).__TYTO_DEV_TOKEN__,
  )) as string;
  const res = await page.request.patch(
    `${E2E_API_URL}/api/v1/communities/${communityId}/channels/${channelId}`,
    {
      data: { allowAttachments: allow },
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/merge-patch+json",
        Accept: "application/ld+json",
      },
    },
  );
  if (!res.ok()) {
    throw new Error(`setAllowAttachments failed: ${res.status()} ${await res.text()}`);
  }
}

test.describe.serial("Attachments — admin enables attachments", () => {
  test("paperclip button appears when allowAttachments is true", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await setAllowAttachments(page, world.communityId, world.textChannelId, true);
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });

    await new ChannelPage(page).focusComposer();
    await expect(page.getByTitle("Attach file")).toBeVisible({ timeout: 6_000 });

    // Cleanup
    await setAllowAttachments(page, world.communityId, world.textChannelId, false);
  });

  test("upload a file — chip appears while uploading, then message shows attachment", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await setAllowAttachments(page, world.communityId, world.textChannelId, true);
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });

    const channel = new ChannelPage(page);
    const filePath = createTempFile("e2e-attach.txt", "hello from E2E attachment test");

    try {
      // Intercept the upload response to get the attachment IRI
      const uploadDone = page.waitForResponse(
        (res) => res.url().includes("/attachments") && res.request().method() === "POST",
        { timeout: 10_000 },
      );

      const fileInput = page.locator('input[type="file"]').last();
      await fileInput.setInputFiles(filePath);

      await expect(page.getByText("e2e-attach.txt")).toBeVisible({ timeout: 8_000 });

      const uploadRes = await uploadDone;
      expect(uploadRes.ok()).toBe(true);
      const uploadData = (await uploadRes.json()) as Record<string, unknown>;
      const attachmentIri = uploadData["@id"] as string;
      expect(typeof attachmentIri).toBe("string");
      expect(attachmentIri.length).toBeGreaterThan(0);

      // Wait for upload spinner to disappear — React has re-rendered with iri set
      await expect(page.locator(".animate-spin")).not.toBeVisible({ timeout: 6_000 });

      // Intercept the message creation response to verify attachment is linked
      const messageDone = page.waitForResponse(
        (res) => res.url().includes("/messages") && res.request().method() === "POST",
        { timeout: 10_000 },
      );

      const text = `Attach msg ${Date.now()}`;
      await channel.sendMessage(text);
      await channel.expectMessage(text);

      const messageRes = await messageDone;
      expect(messageRes.ok()).toBe(true);
      const messageData = (await messageRes.json()) as Record<string, unknown>;
      const attachments = messageData["attachments"] as unknown[] | undefined;
      expect(attachments).toBeDefined();
      expect((attachments ?? []).length).toBeGreaterThan(0);

      // The file name should now appear in the message bubble as an attachment chip.
      await expect(page.getByText("e2e-attach.txt")).toBeVisible({ timeout: 8_000 });
    } finally {
      fs.unlinkSync(filePath);
      await setAllowAttachments(page, world.communityId, world.textChannelId, false);
    }
  });

  test("remove a pending attachment chip before sending", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await setAllowAttachments(page, world.communityId, world.textChannelId, true);
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });

    const filePath = createTempFile("e2e-remove.txt", "remove me");

    try {
      const fileInput = page.locator('input[type="file"]').last();
      await fileInput.setInputFiles(filePath);

      await expect(page.getByText("e2e-remove.txt")).toBeVisible({ timeout: 8_000 });

      // Click the × on the pending chip (rounded-full class, distinct from message trash button)
      await page.locator('button.rounded-full[title="Remove attachment"]').click();

      await expect(page.getByText("e2e-remove.txt")).not.toBeVisible({ timeout: 6_000 });
    } finally {
      fs.unlinkSync(filePath);
      await setAllowAttachments(page, world.communityId, world.textChannelId, false);
    }
  });

  test("admin can delete an attachment on a message", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await setAllowAttachments(page, world.communityId, world.textChannelId, true);
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });

    const channel = new ChannelPage(page);
    const filePath = createTempFile("e2e-del-attach.txt", "delete this attachment");

    try {
      const fileInput = page.locator('input[type="file"]').last();
      await fileInput.setInputFiles(filePath);
      await expect(page.getByText("e2e-del-attach.txt")).toBeVisible({ timeout: 8_000 });

      const text = `Del attach msg ${Date.now()}`;
      await channel.sendMessage(text);
      await channel.expectMessage(text);

      const lastContent = page.locator("main .message-content").last();
      await lastContent.hover();

      const deleteBtn = page.getByTitle("Remove attachment").last();
      await deleteBtn.hover();
      await deleteBtn.click();

      await expect(page.getByText("e2e-del-attach.txt")).not.toBeVisible({ timeout: 6_000 });
    } finally {
      fs.unlinkSync(filePath);
      await setAllowAttachments(page, world.communityId, world.textChannelId, false);
    }
  });
});

test.describe.serial("Attachments — toggle via Edit Channel modal", () => {
  test("enabling allowAttachments shows paperclip button; disabling hides it", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await setAllowAttachments(page, world.communityId, world.textChannelId, false);
    await page.reload();
    await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTitle("Attach file")).toBeHidden();

    await shell.openChannelHeaderMenu();
    await page.getByRole("menuitem", { name: /edit channel/i }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    const checkbox = modal.getByLabel(/allow attachments/i);
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await modal.getByRole("button", { name: /save/i }).click();
    await expect(modal).not.toBeVisible({ timeout: 6_000 });

    await new ChannelPage(page).focusComposer();
    await expect(page.getByTitle("Attach file")).toBeVisible({ timeout: 6_000 });

    await shell.openChannelHeaderMenu();
    await page.getByRole("menuitem", { name: /edit channel/i }).click();
    const modal2 = page.getByRole("dialog");
    await expect(modal2).toBeVisible();
    await modal2.getByLabel(/allow attachments/i).click();
    await modal2.getByRole("button", { name: /save/i }).click();
    await expect(modal2).not.toBeVisible({ timeout: 6_000 });

    await expect(page.getByTitle("Attach file")).not.toBeVisible({ timeout: 6_000 });
  });
});

test.describe.serial("Attachments — regular user", () => {
  test("paperclip button hidden when allowAttachments is false", async ({
    userPage: page,
    browser,
    world,
  }) => {
    // Make the precondition explicit: the admin block shares this channel
    // (same worker/world), so don't assume ambient state — disable attachments
    // as admin first, then assert as the regular user.
    const admin = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(admin, world.communityId).gotoChannel(world.textChannelId);
      await setAllowAttachments(admin, world.communityId, world.textChannelId, false);
    } finally {
      await admin.context().close();
    }

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);

    await expect(page.getByTitle("Attach file")).toBeHidden();
  });

  test("paperclip button appears for regular user when admin enables attachments", async ({
    userPage: page,
    browser,
    world,
  }) => {
    const adminPage = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage, world.communityId).gotoChannel(world.textChannelId);
      await setAllowAttachments(adminPage, world.communityId, world.textChannelId, true);
    } finally {
      await adminPage.context().close();
    }

    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await new ChannelPage(page).focusComposer();
    await expect(page.getByTitle("Attach file")).toBeVisible({ timeout: 8_000 });

    // Cleanup: disable attachments
    const adminPage2 = await authedPage(browser, world.adminJwt);
    try {
      await new AppShell(adminPage2, world.communityId).gotoChannel(world.textChannelId);
      await setAllowAttachments(adminPage2, world.communityId, world.textChannelId, false);
    } finally {
      await adminPage2.context().close();
    }
  });

  test("disallowed file type is rejected with an error, no chip added", async ({
    adminPage: page,
    world,
  }) => {
    // Navigate first so the page has an origin (setAllowAttachments reads the
    // JWT from localStorage), enable attachments, then reload so the composer
    // renders the file input.
    await new AppShell(page, world.communityId).gotoChannel(world.textChannelId);
    await setAllowAttachments(page, world.communityId, world.textChannelId, true);
    try {
      await page.reload();
      await expect(page.locator("main h1:visible").first()).toBeVisible({ timeout: 10_000 });

      // A type absent from server-info allowedMimes → client-side validation
      // rejects it before any upload request.
      const fileInput = page.locator('input[type="file"]').last();
      await fileInput.setInputFiles({
        name: "evil.sh",
        mimeType: "application/x-sh",
        buffer: Buffer.from("#!/bin/sh\necho hi"),
      });

      await expect(page.getByText("File type is not allowed.")).toBeVisible({ timeout: 6_000 });
      await expect(page.getByText("evil.sh")).toHaveCount(0);
    } finally {
      await setAllowAttachments(page, world.communityId, world.textChannelId, false);
    }
  });
});
