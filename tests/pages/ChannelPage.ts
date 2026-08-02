import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { testIds } from "../e2e/testIds";

export class ChannelPage {
  /** The Tiptap ProseMirror editor (send box). */
  readonly messageEditor: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.messageEditor = page.locator('[contenteditable="true"]').last();
  }

  /**
   * Focus the composer to expand it. The collapsed composer hides the bottom
   * action row (attach + emoji); those controls only render once expanded.
   */
  async focusComposer(): Promise<void> {
    await this.messageEditor.click();
  }

  /** Type a message and press Enter (default submit key) to send it. */
  async sendMessage(text: string): Promise<void> {
    await this.messageEditor.click();
    await this.messageEditor.fill(text);
    await this.messageEditor.press("Enter");
  }

  async expectMessage(text: string, timeout = 8_000): Promise<void> {
    // Use .first() to avoid strict-mode violations when the same text appears
    // multiple times (e.g. both in the message list and the in-progress SSE list).
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible({ timeout });
  }

  async expectMessageGone(text: string, timeout = 8_000): Promise<void> {
    await expect(this.page.getByText(text, { exact: false }).first()).not.toBeVisible({ timeout });
  }

  /**
   * Hover over the last message's content area to reveal the action toolbar,
   * then click the action with the given title.
   *
   * The MessageGroup component shows/hides actions via React state (onMouseEnter/Leave),
   * not Tailwind CSS group classes, so we hover the `.message-content` div.
   */
  private async hoverLastMessageAndClick(actionTestId: string): Promise<void> {
    const lastContent = this.page.locator("main .message-content").last();
    const button = this.page.getByTestId(actionTestId).last();
    await lastContent.hover();
    // Wait for React to re-render and reveal the action toolbar, then move the
    // cursor directly onto the button before clicking.  Moving the cursor from
    // the message content to the button travels through DOM descendants of the
    // message group, so the hover state (isGroupHovered) is never lost.
    await expect(button).toBeAttached({ timeout: 8_000 });
    await expect(button).toBeVisible({ timeout: 5_000 });
    await button.hover();
    await button.click();
  }

  async editLastMessage(newText: string): Promise<void> {
    await this.hoverLastMessageAndClick(testIds.msgActionEdit);

    // The inline edit editor is inserted BEFORE the main send box in DOM order, so it is
    // the FIRST contenteditable. (Using .last() would pick up the main send box instead.)
    const editEditor = this.page.locator('[contenteditable="true"]').first();
    await editEditor.waitFor({ state: "visible" });
    await editEditor.click();
    // Use Ctrl+A + pressSequentially to type via real keyboard events.
    // fill() sets the DOM but does not update ProseMirror's internal state,
    // leaving editor.isEmpty=true and the Save button disabled.
    await editEditor.press("Control+a");
    await editEditor.pressSequentially(newText);
    // Click Save — reliable across all submitKey preferences
    await this.page.getByTestId(testIds.msgEditSaveBtn).click();
  }

  async deleteLastMessage(): Promise<void> {
    await this.hoverLastMessageAndClick(testIds.msgActionDelete);
    // MessageActions shows an inline "Delete? Yes / Cancel" confirmation (not a modal)
    await this.page.getByTestId(testIds.msgDeleteConfirmBtn).click();
  }

  /**
   * Hover the last message, open the emoji picker via "Add reaction", and click
   * the given emoji.  After this the reaction pill for that emoji will appear.
   */
  async addReactionToLastMessage(emoji: string): Promise<void> {
    const lastContent = this.page.locator("main .message-content").last();
    await lastContent.hover();
    await this.page.getByTestId(testIds.msgActionReact).last().click();
    // The picker renders the emoji as a button; pick the last match to avoid
    // conflicts with any existing reaction pill that may already be visible.
    await this.page.getByRole("button", { name: emoji }).last().click();
  }
}
