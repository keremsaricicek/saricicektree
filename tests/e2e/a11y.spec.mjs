// Automated accessibility check (axe-core, WCAG 2.1 A/AA rules) on every main page and the main
// dialogs, at phone and desktop width. Automated rules find only part of the problems; the
// phone checklist (docs/PHONE-CHECKLIST.md) covers screen readers on real devices.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  "home",
  "tree",
  "people",
  "gallery",
  "calendar",
  "history",
  "places",
  "chat",
  "documents",
  "archive",
  "connections",
  "groups",
  "admin",
  "settings",
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function violations(page, where) {
  // Colours are checked in their final state, after page and dialog entrance animations end. Content that arrives
  // later starts new animations, so wait until two frames in a row have none left running (endless ones excepted).
  await page.evaluate(async () => {
    const left = () =>
      document.getAnimations().filter((a) => a.playState !== "finished" && a.playState !== "idle" && a.effect?.getTiming().iterations !== Infinity);
    for (let i = 0; i < 20 && left().length; i++) {
      await Promise.all(left().map((a) => a.finished.catch(() => {})));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  });
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return r.violations.flatMap((v) => v.nodes.map((n) => `${where}: ${v.id} (${v.impact}) ${n.target.join(" ")}`));
}

for (const [name, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
])
  test(`no WCAG A/AA violations on pages and dialogs (${name})`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    await page.goto("/index.html?demo=1#home");
    await expect(page.locator(".ds-post").first()).toBeVisible();
    const found = [];
    for (const r of ROUTES) {
      await page.evaluate((r) => (location.hash = r), r);
      await expect(page.locator("main")).toBeVisible();
      found.push(...(await violations(page, r)));
    }
    await page.evaluate(() => (location.hash = "gallery"));
    await page.locator(".hm-tile").first().click();
    await expect(page.locator("#dialog[open] .hm-view-story")).toBeVisible();
    found.push(...(await violations(page, "photo dialog")));
    await page.keyboard.press("Escape");
    await page.evaluate(() => handle("account", document.querySelector("[data-action=account]")));
    await expect(page.locator("#dialog[open]")).toBeVisible();
    found.push(...(await violations(page, "account dialog")));
    expect(found).toEqual([]);
  });

test("no WCAG A/AA violations on the sign-in page", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("input[type=password]").first()).toBeVisible();
  expect(await violations(page, "sign-in")).toEqual([]);
  await context.close();
});
