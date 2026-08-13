import type { Page, Locator } from "@playwright/test";
import { testIds } from "../e2e/testIds";
import { expect } from "@playwright/test";
import { T } from "../e2e/fixtures";

/**
 * Page object for the channel sidebar (left panel inside the app shell).
 * Provides helpers for admin actions: sections, channels, community edit.
 */
export class ChannelSidebar {
  private readonly page: Page;
  private readonly communityId: string;

  constructor(page: Page, communityId: string) {
    this.page = page;
    this.communityId = communityId;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.communityId}`);
    await expect(this.page.locator("aside")).toBeVisible({ timeout: T(8_000) });
  }

  async openCreateSection(): Promise<void> {
    await this.page.getByTestId(testIds.communityActionsBtn).click();
    await this.page.getByRole("menuitem", { name: /add section/i }).click();
  }

  async openEditSection(sectionName: string): Promise<void> {
    await this.openSectionMenu(sectionName);
    await this.page.getByRole("menuitem", { name: /edit section/i }).click();
  }

  async deleteSection(sectionName: string): Promise<void> {
    const header = this.sectionHeader(sectionName);
    await this.openSectionMenu(sectionName);
    await this.page.getByRole("menuitem", { name: /delete section/i }).click();
    // Inline confirm row replaces the section header buttons.
    await header.getByTitle("Confirm delete").click({ force: true });
  }

  async openCreateChannelInSection(sectionName: string): Promise<void> {
    await this.openSectionMenu(sectionName);
    await this.page.getByRole("menuitem", { name: /add channel/i }).click();
  }

  private async openSectionMenu(sectionName: string): Promise<void> {
    const header = this.sectionHeader(sectionName);
    await header.hover();
    await header.getByTestId(testIds.sectionActionsBtn).click({ force: true });
  }

  async expectSectionVisible(name: string): Promise<void> {
    await expect(this.sectionHeader(name)).toBeVisible({ timeout: T(6_000) });
  }

  async expectSectionGone(name: string): Promise<void> {
    await expect(this.sectionHeader(name)).not.toBeVisible({ timeout: T(6_000) });
  }

  /**
   * Section header is the `div.group` row that wraps both the collapse toggle
   * (a `<button>` with a `<span>` name) and the admin action buttons. Targeting
   * the row (not just the span) lets us reach the sibling buttons via
   * getByTitle. The name renders in a span (CSS-uppercased, so the DOM text is
   * the original case).
   */
  private sectionHeader(name: string): Locator {
    return this.page
      .locator("aside div.group")
      .filter({ has: this.page.locator("span", { hasText: name }) })
      .first();
  }

  async expectChannelInSidebar(identifier: string): Promise<void> {
    // Match by href ending — avoids substring collisions (e.g. "foo" vs "foo-1")
    await expect(this.page.locator(`aside a[href$="/${identifier}"]`)).toBeVisible({
      timeout: T(6_000),
    });
  }

  async expectChannelGone(identifier: string): Promise<void> {
    await expect(this.page.locator(`aside a[href$="/${identifier}"]`)).not.toBeVisible({
      timeout: T(6_000),
    });
  }

  // ── Channel modal helpers (shared between create & edit) ────────────────────

  async fillChannelModal({
    name,
    description,
    type,
    isPrivate,
    isReadonly,
  }: {
    name?: string;
    description?: string;
    type?: "text" | "audio";
    isPrivate?: boolean;
    isReadonly?: boolean;
  }): Promise<void> {
    const modal = this.page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: T(6_000) });

    if (type) {
      const label = type === "text" ? /# text/i : /voice/i;
      await modal.getByRole("button", { name: label }).click();
    }
    if (name !== undefined) {
      await modal.getByLabel("Name").fill(name);
    }
    if (description !== undefined) {
      await modal.getByLabel(/description/i).fill(description);
    }
    if (isPrivate !== undefined) {
      const checkbox = modal.getByLabel(/private/i);
      if ((await checkbox.isChecked()) !== isPrivate) await checkbox.click();
    }
    if (isReadonly !== undefined) {
      const checkbox = modal.getByLabel(/readonly/i);
      if ((await checkbox.isChecked()) !== isReadonly) await checkbox.click();
    }
  }

  async submitModal(): Promise<void> {
    const modal = this.page.getByRole("dialog");
    await modal.getByRole("button", { name: /^(create|save)$/i }).click();
    await expect(modal).not.toBeVisible({ timeout: T(8_000) });
  }
}
