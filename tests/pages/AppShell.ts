import type { Page, Locator } from "@playwright/test";
import { testIds } from "../e2e/testIds";
import { expect } from "@playwright/test";
import { T } from "../e2e/fixtures";

export class AppShell {
  readonly communitySidebar: Locator;
  private readonly page: Page;
  private readonly communityId: string;

  constructor(page: Page, communityId: string) {
    this.page = page;
    this.communitySidebar = page.locator("nav").first();
    this.communityId = communityId;
  }

  async gotoChannel(channelId: string, { waitForMercure = false } = {}): Promise<void> {
    // Start listening for the Mercure SSE response BEFORE navigating so we
    // don't miss it if the EventSource fires immediately after mount.
    const mercureReady = waitForMercure
      ? this.page.waitForResponse(
          (res) => res.url().includes("mercure") && res.url().includes("topic="),
          { timeout: T(10_000) },
        )
      : null;

    await this.page.goto(`/${this.communityId}/${channelId}`);
    // Wait for the channel heading — confirms the channel component has mounted.
    // (networkidle never fires because the SSE connection keeps the network active.)
    await expect(this.page.locator("main h1:visible").first()).toBeVisible({ timeout: T(15_000) });

    // If requested, wait until the Mercure hub has accepted the SSE subscription
    // (HTTP 200 response received). This guarantees events published after this
    // point will be delivered to this page.
    if (mercureReady) await mercureReady;
  }

  async expectChannelVisible(channelId: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(channelId));
  }

  async clickChannel(name: string): Promise<void> {
    await this.page.getByRole("link", { name, exact: false }).first().click();
  }

  async clickCommunity(name: string): Promise<void> {
    await this.page.getByTitle(name, { exact: false }).first().click();
  }

  /**
   * Open the community-header overflow (⋯) menu, which holds admin actions
   * (manage community, add section, leave, mark-read). Many actions that used
   * to be standalone header buttons now live here.
   */
  async openCommunityMenu(): Promise<void> {
    await this.page.getByTestId(testIds.communityActionsBtn).click();
  }

  /**
   * Open the channel-header overflow (⋯) menu, which holds edit-channel,
   * view-members, and manage-access (previously standalone header buttons).
   */
  async openChannelHeaderMenu(): Promise<void> {
    await this.page.getByTestId(testIds.channelHeaderMenuBtn).click();
  }

  /**
   * The header menu is a portalled popover that closes on any outside mousedown
   * and remounts with the header, so a re-render between opening it and picking
   * an item leaves nothing to click.  Reopen and retry until one click lands.
   */
  private async clickChannelHeaderMenuItem(name: string | RegExp): Promise<void> {
    const item = this.page.getByRole("menuitem", { name });
    await expect(async () => {
      if (!(await item.isVisible())) await this.openChannelHeaderMenu();
      await item.click({ timeout: T(2_000) });
    }).toPass({ timeout: T(15_000) });
  }

  async openManageChannelAccess(): Promise<void> {
    await this.clickChannelHeaderMenuItem("Manage channel access");
  }

  async openChannelMembers(): Promise<void> {
    await this.clickChannelHeaderMenuItem("View members");
  }

  async openEditChannel(): Promise<void> {
    await this.clickChannelHeaderMenuItem(/edit channel/i);
  }
}
