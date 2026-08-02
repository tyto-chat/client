import type { Page, Locator } from "@playwright/test";
import { testIds } from "../e2e/testIds";
import { expect } from "@playwright/test";

/**
 * Page object for the "Roles" tab of the Manage community modal. Each role
 * (admin, moderator) has its own UserPicker — `promote()` types into the
 * right one based on whichever Add button label is supplied.
 */
export class CommunityRolesPanel {
  readonly dialog: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole("dialog");
  }

  async openFromSidebar(): Promise<void> {
    await this.page.getByTestId(testIds.communityActionsBtn).click();
    await this.page.getByTestId(testIds.manageCommunity).click();
    await expect(this.dialog).toBeVisible({ timeout: 6_000 });
    await this.dialog.getByRole("button", { name: "Roles", exact: true }).click();
  }

  async close(): Promise<void> {
    await this.dialog.getByRole("button", { name: "Close" }).first().dispatchEvent("click");
    await expect(this.dialog).not.toBeVisible({ timeout: 6_000 });
  }

  /**
   * Promote a member via the picker for either the admin or moderator section.
   * `target` decides which UserPicker we type into, since the panel renders one
   * per section.
   */
  async promote(target: "admin" | "moderator", memberName: string): Promise<void> {
    const buttonLabel = target === "admin" ? "Add admin" : "Add moderator";
    const section = this.sectionFor(target);
    await section.getByPlaceholder("Search members…").fill(memberName);
    const row = section
      .getByRole("listitem")
      .filter({ hasText: memberName })
      .filter({ has: this.page.getByRole("button", { name: buttonLabel, exact: true }) })
      .first();
    await expect(row).toBeVisible({ timeout: 6_000 });
    await row.getByRole("button", { name: buttonLabel, exact: true }).click();
  }

  async demote(target: "admin" | "moderator", memberName: string): Promise<void> {
    const section = this.sectionFor(target);
    const row = section.locator("li").filter({ hasText: memberName }).first();
    await row.getByRole("button", { name: "Demote", exact: true }).click();
  }

  async expectInRole(target: "admin" | "moderator", memberName: string): Promise<void> {
    const section = this.sectionFor(target);
    await expect(section.locator("li").filter({ hasText: memberName }).first()).toBeVisible({
      timeout: 6_000,
    });
  }

  async expectNotInRole(target: "admin" | "moderator", memberName: string): Promise<void> {
    const section = this.sectionFor(target);
    await expect(section.locator("li").filter({ hasText: memberName }).first()).not.toBeVisible({
      timeout: 6_000,
    });
  }

  private sectionFor(target: "admin" | "moderator"): Locator {
    const heading = target === "admin" ? "Community admins" : "Community moderators";
    return this.dialog
      .locator("section")
      .filter({ has: this.page.getByRole("heading", { name: heading }) });
  }
}
