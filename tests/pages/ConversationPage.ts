import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { T } from "../e2e/fixtures";

export class ConversationPage {
  readonly messageEditor: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.messageEditor = page.locator('[contenteditable="true"]').last();
  }

  async gotoIndex(): Promise<void> {
    await this.page.goto("/dm");
    await expect(this.page.locator("aside")).toBeVisible({ timeout: T(10_000) });
  }

  async goto(conversationIdentifier: string, { waitForMercure = false } = {}): Promise<void> {
    const mercureReady = waitForMercure
      ? this.page.waitForResponse(
          (res) => res.url().includes("mercure") && res.url().includes("topic="),
          { timeout: T(10_000) },
        )
      : null;
    await this.page.goto(`/dm/${conversationIdentifier}`);
    await expect(this.page.locator("main h1:visible").first()).toBeVisible({ timeout: T(15_000) });
    if (mercureReady) await mercureReady;
  }

  async sendMessage(text: string): Promise<void> {
    await this.messageEditor.click();
    await this.messageEditor.fill(text);
    await this.messageEditor.press("Enter");
  }

  async expectMessage(text: string, timeout = 8_000): Promise<void> {
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible({ timeout });
  }

  async openConversationByName(name: string): Promise<void> {
    await this.page.locator("aside").getByText(name, { exact: false }).first().click();
  }

  async openSettings(): Promise<void> {
    await this.page.getByTitle(/conversation settings/i).click();
  }

  async toggleMute(): Promise<void> {
    await this.page.getByRole("button", { name: /^(mute|muted)$/i }).click();
  }

  async closeSettings(): Promise<void> {
    // The Modal shell also renders an X icon with aria-label="Close"; the
    // settings footer's text-only Close button has no aria-label.
    await this.page.locator("button:not([aria-label])", { hasText: /^Close$/ }).click();
  }

  async addReactionToLastMessage(emoji: string): Promise<void> {
    const lastContent = this.page.locator("main .message-content").last();
    await lastContent.hover();
    await this.page.getByTitle("Add reaction").last().click();
    await this.page.getByRole("button", { name: emoji }).last().click();
  }

  async expectReactionPill(emoji: string, timeout = 8_000): Promise<void> {
    await expect(this.page.locator("main").getByText(emoji, { exact: false }).first()).toBeVisible({
      timeout,
    });
  }
}
