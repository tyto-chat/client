import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { testIds } from "../e2e/testIds";
import { T } from "../e2e/fixtures";

/**
 * Phone-viewport shell affordances (MobileTopBar + off-canvas nav drawer +
 * overflow action menu). Encapsulates the repeated "navigate then wait for the
 * mobile top bar to mount" bootstrap and the drawer/menu controls the mobile-*
 * specs share.
 */
export class MobilePage {
  readonly navToggle: Locator;
  readonly navScrim: Locator;
  readonly actionMenuBtn: Locator;
  readonly searchBtn: Locator;

  private readonly page: Page;
  private readonly communityId: string;

  constructor(page: Page, communityId: string) {
    this.page = page;
    this.communityId = communityId;
    this.navToggle = page.getByTestId(testIds.mobileNavToggle);
    this.navScrim = page.getByTestId(testIds.mobileNavScrim);
    this.actionMenuBtn = page.getByTestId(testIds.mobileActionMenuBtn);
    this.searchBtn = page.getByTestId(testIds.mobileSearchOpenBtn);
  }

  async gotoChannel(channelId: string): Promise<void> {
    await this.page.goto(`/${this.communityId}/${channelId}`);
    await expect(this.navToggle).toBeVisible({ timeout: T(15_000) });
  }

  /** Open the off-canvas nav drawer; resolves once the scrim is in view. */
  async openNav(): Promise<void> {
    await this.navToggle.click();
    await expect(this.navScrim).toBeInViewport();
  }

  async openActionMenu(): Promise<void> {
    await this.actionMenuBtn.click();
  }
}
