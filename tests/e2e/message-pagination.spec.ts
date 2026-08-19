/**
 * Message pagination — channel timeline paging across MessagePage boundaries.
 *
 * The server groups channel messages into pages of MessagePage::PAGE_SIZE (50)
 * roots. The client opens a channel on the LATEST page and walks outward:
 * scrolling up fetches page N-1 (`getPreviousPageParam`), scrolling down fetches
 * page N+1 up to `latestPageNumber` (`getNextPageParam`). Both directions are
 * driven by IntersectionObserver sentinels in useMessagePaneScroll, which also
 * restores scroll position after a prepend.
 *
 * This spec seeds its OWN channel with 55 messages (page 1 = 001..050, page 2 =
 * 051..055) rather than using the world's shared `general` channel — 55 extra
 * messages there would slow every other spec the worker runs.
 *
 * Covered:
 *   1. Opening the channel loads the latest page only.
 *   2. Scrolling to the top loads the previous page, keeps both pages, and does
 *      not yank the reader's anchor to the top.
 *   3. A permalink into page 1 seeds that page, and scrolling down walks
 *      forward to the latest page.
 */

import { test, expect } from "./worldFixtures";
import { E2E_API_URL, E2E_BASE_URL, T } from "./fixtures";
import { AppShell } from "../pages/AppShell";
import { WorldBuilder } from "./world/builder";
import { testIds } from "./testIds";

const PAGE_SIZE = 50;
// The latest page must overflow the viewport on its own: the top sentinel is
// evaluated as soon as the pane renders, and a short page leaves it on screen,
// so the client legitimately auto-fills the previous page and "latest page
// only" never holds. 30 messages on page 2 clear the scroll container.
const TOTAL = 80;

const label = (n: number) => `pagination message ${String(n).padStart(3, "0")}`;
const OLDEST = label(1);
const LAST_OF_PAGE_1 = label(PAGE_SIZE);
const NEWEST = label(TOTAL);
const BEGINNING_LABEL = "Beginning of channel history";

let channelId: string;

test.describe.serial("Message pagination — channel timeline", () => {
  test.beforeAll(async ({ world }) => {
    // 55 sequential POSTs; page assignment follows insertion order, so they
    // cannot be parallelised.
    test.setTimeout(180_000);

    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    try {
      const name = `pagination-${world.communityId}`;
      if (await wb.channelExists(world.communityId, name)) {
        channelId = name;
        return;
      }
      channelId = await wb.createTextChannel(world.communityId, name);
      await wb.sendChannelMessages(
        world.communityId,
        channelId,
        Array.from({ length: TOTAL }, (_, i) => label(i + 1)),
      );
    } finally {
      await wb.dispose();
    }
  });

  test("opening the channel loads the latest page only", async ({ adminPage: page, world }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelId);

    await expect(page.getByText(NEWEST, { exact: false }).first()).toBeVisible({
      timeout: T(10_000),
    });
    await expect(page.getByText(label(PAGE_SIZE + 1), { exact: false }).first()).toBeVisible();

    await expect(page.getByText(OLDEST, { exact: false })).toHaveCount(0);
    await expect(page.getByText(LAST_OF_PAGE_1, { exact: false })).toHaveCount(0);
    await expect(page.getByText(BEGINNING_LABEL)).toHaveCount(0);
  });

  test("scrolling to the top loads the previous page and holds the anchor", async ({
    adminPage: page,
    world,
  }) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(channelId);

    const newest = page.getByText(NEWEST, { exact: false }).first();
    await expect(newest).toBeVisible({ timeout: T(10_000) });

    const scroller = page.getByTestId(testIds.messageScroll);
    await scroller.evaluate((el) => {
      el.scrollTop = -el.scrollHeight;
    });

    const oldest = page.getByText(OLDEST, { exact: false }).first();
    await expect(oldest).toBeAttached({ timeout: T(10_000) });
    await expect(page.getByText(BEGINNING_LABEL)).toBeVisible({ timeout: T(10_000) });

    // Both pages stay in the cache — paging back must not evict the latest page.
    await expect(newest).toBeAttached();
    await expect(page.getByText(OLDEST, { exact: false })).toHaveCount(1);

    // column-reverse keeps scroll bottom-referenced, so whatever the reader
    // was looking at stays put when the previous page prepends above.
    await expect(page.getByText(label(PAGE_SIZE + 1), { exact: false }).first()).toBeInViewport();
  });

  test("permalink into page 1 seeds that page and scrolling down reaches the latest", async ({
    adminPage: page,
    world,
  }) => {
    const wb = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, world.adminJwt);
    await wb.init();
    let uuid: string;
    try {
      const firstPage = await wb.getChannelPage(world.communityId, channelId, 1);
      const target = firstPage.messages.find((m) => m.text?.includes(OLDEST));
      expect(target, `Seeded message "${OLDEST}" should be on page 1`).toBeTruthy();
      uuid = target!["@id"].split("/").pop()!;
    } finally {
      await wb.dispose();
    }

    await page.goto(`/m/${uuid}`);

    await expect(page).toHaveURL(new RegExp(`/${world.communityId}/${channelId}`), {
      timeout: T(10_000),
    });
    await expect(page.getByText(OLDEST, { exact: false }).first()).toBeVisible({
      timeout: T(10_000),
    });
    await expect(page.getByText(NEWEST, { exact: false })).toHaveCount(0);

    const scroller = page.getByTestId(testIds.messageScroll);
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    await expect(page.getByText(NEWEST, { exact: false }).first()).toBeAttached({
      timeout: T(10_000),
    });
  });
});
