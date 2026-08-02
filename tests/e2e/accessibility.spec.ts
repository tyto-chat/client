import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./worldFixtures";
import { LoginPage } from "../pages/LoginPage";
import { AppShell } from "../pages/AppShell";
import type { Page, TestInfo } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, testInfo: TestInfo) {
  // Entry animations blend the foreground into its background, so axe samples a
  // half-faded colour and reports a contrast failure that does not exist at rest.
  // The app zeroes animations under prefers-reduced-motion; use that, then wait
  // for anything still running to settle.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  if (results.violations.length > 0) {
    await testInfo.attach("axe-violations", {
      body: JSON.stringify(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => n.target),
        })),
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
  return results.violations;
}

test.describe("Accessibility (axe-core WCAG 2.1 AA)", () => {
  test("login page has no violations", async ({ page }, testInfo) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(page.locator("#email")).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test("channel view has no violations", async ({ adminPage: page, world }, testInfo) => {
    const shell = new AppShell(page, world.communityId);
    await shell.gotoChannel(world.textChannelId);
    await expect(page.locator("main h1:visible").first()).toBeVisible();
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test("direct-messages view has no violations", async ({ adminPage: page }, testInfo) => {
    await page.goto("/dm");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
    expect(await scan(page, testInfo)).toEqual([]);
  });

  test("admin panel has no violations", async ({ adminPage: page }, testInfo) => {
    await page.goto("/admin");
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
    expect(await scan(page, testInfo)).toEqual([]);
  });
});
