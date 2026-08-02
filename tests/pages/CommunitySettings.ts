import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { testIds } from "../e2e/testIds";

/**
 * Community settings modal — opened from the sidebar header's ⋯ menu.
 *
 * Tab selection goes through `community-tab-<key>` testids. ModalTabs measures
 * available width and pushes the tabs that do not fit into a "More" menu, so a
 * tab may be either a pill or a menu item depending on how many tabs the caller's
 * role can see. The helper handles both.
 */
export class CommunitySettings {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async openTab(key: string): Promise<void> {
    await expect(this.page.locator("aside")).toBeVisible({ timeout: 8_000 });
    await this.page.getByTestId(testIds.communityActionsBtn).click();
    await this.page.getByTestId(testIds.manageCommunity).click();

    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // Not scoped to the dialog: overflowed tabs render as menu items in a portal
    // outside it.
    const tab = this.page.getByTestId(`community-tab-${key}`);
    if ((await tab.count()) === 0) {
      await dialog.getByRole("button", { name: "More" }).click();
    }
    await tab.click();
  }
}
