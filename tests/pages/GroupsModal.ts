import type { Page, Locator } from "@playwright/test";
import { testIds } from "../e2e/testIds";
import { expect } from "@playwright/test";
import { T } from "../e2e/fixtures";

export class GroupsModal {
  readonly dialog: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole("dialog");
  }

  async openFromSidebar(): Promise<void> {
    await this.page.getByTestId(testIds.communityActionsBtn).click();
    await this.page.getByTestId(testIds.manageCommunity).click();
    await expect(this.dialog).toBeVisible({ timeout: T(6_000) });
    await this.dialog.getByRole("button", { name: "Groups", exact: true }).click();
  }

  async close(): Promise<void> {
    await this.dialog.getByRole("button", { name: "Close" }).dispatchEvent("click");
    await expect(this.dialog).not.toBeVisible({ timeout: T(6_000) });
  }

  async createGroup(name: string): Promise<void> {
    await this.dialog.getByRole("button", { name: "Create Group" }).click();
    await this.dialog.getByLabel("Name").fill(name);
    await this.dialog.getByRole("button", { name: "Create Group" }).click();
    await this.expectGroupInList(name);
  }

  async editGroup(name: string, newName: string): Promise<void> {
    // Edit/delete moved from list rows to the group detail hero.
    await this.openDetail(name);
    await this.dialog.getByTitle("Edit").click();
    await this.dialog.getByLabel("Name").fill(newName);
    await this.dialog.getByRole("button", { name: "Save" }).click();
    // Save returns to the detail view — hop back to the list.
    await expect(this.dialog.getByTestId(testIds.groupChannelPermissions)).toBeVisible({
      timeout: T(6_000),
    });
    await this.back();
    await this.expectGroupInList(newName);
  }

  async deleteGroup(name: string): Promise<void> {
    await this.openDetail(name);
    await this.dialog.getByTitle("Delete").click();
    await this.dialog.getByTitle("Confirm delete").click();
  }

  async openDetail(name: string): Promise<void> {
    await this.dialog.locator("li.cursor-pointer").filter({ hasText: name }).click();
    await expect(this.dialog.getByTestId(testIds.groupChannelPermissions)).toBeVisible({
      timeout: T(6_000),
    });
  }

  async addMember(query: string): Promise<void> {
    await this.dialog.getByPlaceholder(/add a member/i).fill(query);
    const resultItem = this.dialog
      .getByRole("listitem")
      .filter({ hasText: query })
      .filter({ has: this.page.getByRole("button", { name: "Add" }) })
      .first();
    await expect(resultItem).toBeVisible({ timeout: T(6_000) });
    await resultItem.getByRole("button", { name: "Add" }).click();
  }

  async removeMember(name: string): Promise<void> {
    const row = this.dialog
      .getByRole("listitem")
      .filter({ hasText: name })
      .filter({ has: this.page.getByRole("button", { name: "Remove" }) });
    await row.getByRole("button", { name: "Remove" }).click();
  }

  async makeOwner(name: string): Promise<void> {
    const row = this.dialog.getByRole("listitem").filter({ hasText: name });
    await row.getByRole("button", { name: /make owner/i }).click();
  }

  async expectOwnerBadge(name: string): Promise<void> {
    const row = this.dialog.getByRole("listitem").filter({ hasText: name });
    await expect(row.getByText("Owner", { exact: true })).toBeVisible({ timeout: T(6_000) });
  }

  async expectNoOwnerBadge(name: string): Promise<void> {
    const row = this.dialog.getByRole("listitem").filter({ hasText: name });
    await expect(row.getByText("Owner", { exact: true })).not.toBeVisible({ timeout: T(6_000) });
  }

  async openChannelPermissions(): Promise<void> {
    await this.dialog.getByTestId(testIds.groupChannelPermissions).click();
    await expect(this.dialog.getByRole("button", { name: /back/i })).toBeVisible({
      timeout: T(6_000),
    });
  }

  async setChannelPermission(channelName: string, role: string): Promise<void> {
    // Role is a segmented control: buttons carrying data-role-value.
    const channelRow = this.dialog
      .locator("div:has([data-role-value])")
      .filter({ has: this.page.getByText(channelName, { exact: true }) })
      .last();
    await channelRow.locator(`[data-role-value="${role}"]`).click();
    await expect(channelRow.locator(`[data-role-value="${role}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: T(6_000) },
    );
  }

  async expectChannelPermission(channelName: string, role: string): Promise<void> {
    const channelRow = this.dialog
      .locator("div:has([data-role-value])")
      .filter({ has: this.page.getByText(channelName, { exact: true }) })
      .last();
    await expect(channelRow.locator(`[data-role-value="${role}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: T(6_000) },
    );
  }

  async back(): Promise<void> {
    await this.dialog.getByRole("button", { name: /back/i }).click();
  }

  async expectGroupInList(name: string): Promise<void> {
    await expect(this.dialog.locator("li.cursor-pointer").filter({ hasText: name })).toBeVisible({
      timeout: T(6_000),
    });
  }

  async expectGroupGone(name: string): Promise<void> {
    await expect(
      this.dialog.locator("li.cursor-pointer").filter({ hasText: name }),
    ).not.toBeVisible({ timeout: T(6_000) });
  }

  async expectMemberInList(name: string): Promise<void> {
    await expect(this.dialog.getByRole("listitem").filter({ hasText: name }).last()).toBeVisible({
      timeout: T(6_000),
    });
  }

  async expectNoMembers(): Promise<void> {
    await expect(this.dialog.getByText(/no members yet/i)).toBeVisible({ timeout: T(6_000) });
  }
}
