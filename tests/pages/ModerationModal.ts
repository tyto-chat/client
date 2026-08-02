import type { Page, Locator } from "@playwright/test";
import { testIds } from "../e2e/testIds";
import { expect } from "@playwright/test";

export class ModerationModal {
  readonly dialog: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole("dialog");
  }

  /**
   * Click a user's author name in the chat message list to open their moderation panel.
   * The target user must have sent at least one visible message in the current channel.
   */
  async openForUserInChat(displayName: string): Promise<void> {
    await this.page.locator("main").getByText(displayName, { exact: true }).first().click();
    await expect(this.dialog).toBeVisible({ timeout: 6_000 });
  }

  async goToActionsTab(): Promise<void> {
    await this.dialog.getByTestId(testIds.modTabActions).click();
  }

  async goToNotesTab(): Promise<void> {
    await this.dialog.getByTestId(testIds.modTabNotes).click();
  }

  async applyAction(
    type: "warn" | "timeout" | "ban" | "server_ban",
    options: { reason?: string } = {},
  ): Promise<void> {
    await this.dialog.getByTestId(`mod-action-${type}`).click();
    if (options.reason) {
      await this.dialog.getByPlaceholder("Reason (optional)…").fill(options.reason);
    }
    await this.dialog.getByTestId(testIds.modApply).click();
  }

  async expectActionSuccess(): Promise<void> {
    await expect(this.page.getByText("Action applied.")).toBeVisible({ timeout: 6_000 });
  }

  async expectActionError(): Promise<void> {
    await expect(this.page.getByText("Failed to apply action.")).toBeVisible({ timeout: 6_000 });
  }

  async expectStatusBadge(text: "Timed out" | "Banned"): Promise<void> {
    await expect(this.dialog.getByText(text)).toBeVisible({ timeout: 6_000 });
  }

  async expectNoStatusBadge(): Promise<void> {
    await expect(this.dialog.getByText("Timed out")).toBeHidden();
    await expect(this.dialog.getByText("Banned")).toBeHidden();
  }

  async liftFirstActiveAction(): Promise<void> {
    await this.dialog.getByRole("button", { name: "Lift" }).first().click();
    await expect(this.page.getByText("Restriction lifted.")).toBeVisible({ timeout: 6_000 });
  }

  /** Lift every active action shown in the modal (for cleanup in tests). */
  async liftAllActiveActions(): Promise<void> {
    while (await this.dialog.getByRole("button", { name: "Lift" }).first().isVisible()) {
      await this.dialog.getByRole("button", { name: "Lift" }).first().click();
      await expect(this.page.getByText("Restriction lifted.")).toBeVisible({ timeout: 6_000 });
    }
  }

  async expectNoActiveActions(): Promise<void> {
    await expect(this.dialog.getByText("No active restrictions.")).toBeVisible({ timeout: 6_000 });
  }

  /**
   * Add a moderator note and wait for the success notification.
   * Requires the Notes tab to be active.
   */
  async addNote(content: string): Promise<void> {
    await this.dialog.getByPlaceholder("Add a note…").fill(content);
    await this.dialog.getByRole("button", { name: "Add note" }).click();
    await expect(this.page.getByText("Note saved.")).toBeVisible({ timeout: 6_000 });
  }

  async expectNote(content: string): Promise<void> {
    await expect(this.dialog.getByText(content)).toBeVisible({ timeout: 6_000 });
  }

  async expectNoteGone(content: string): Promise<void> {
    await expect(this.dialog.getByText(content)).not.toBeVisible({ timeout: 4_000 });
  }

  async editNote(currentContent: string, newContent: string): Promise<void> {
    const noteRow = this.dialog.locator(".rounded-lg").filter({ hasText: currentContent });
    await noteRow.getByTitle("Edit note").click();
    await expect(this.dialog.getByTitle("Save note")).toBeVisible({ timeout: 4_000 });
    const editTextarea = this.dialog.getByTestId(testIds.noteEditTextarea);
    // Use keyboard to type — fire real key events that React handles natively
    await editTextarea.click({ clickCount: 3 });
    await this.page.keyboard.press("Control+a");
    await this.page.keyboard.type(newContent, { delay: 10 });
    // Verify React state is committed via data-value attribute
    await expect(editTextarea).toHaveAttribute("data-value", newContent, { timeout: 4_000 });
    await this.dialog.getByTitle("Save note").click();
    await expect(this.page.getByText("Note saved.").last()).toBeVisible({ timeout: 6_000 });
    await expect(
      this.dialog.locator(".rounded-lg").filter({ hasText: newContent }).getByTitle("Edit note"),
    ).toBeVisible({ timeout: 6_000 });
  }

  async deleteNote(content: string): Promise<void> {
    const noteRow = this.dialog.locator(".rounded-lg").filter({ hasText: content });
    await noteRow.getByTitle("Delete note").click();
    await expect(this.page.getByText("Note deleted.")).toBeVisible({ timeout: 6_000 });
  }

  async close(): Promise<void> {
    await this.dialog.getByRole("button", { name: "Close" }).click();
    await expect(this.dialog).not.toBeVisible({ timeout: 6_000 });
  }
}
