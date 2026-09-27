// Rendering checks on the real app in demo mode (all scripts, including public/ui/). These replace
// three Node VM tests that only exercised older render functions the app no longer uses.
import { test, expect } from "@playwright/test";

const PAGES = ["people", "tree", "gallery", "calendar", "history", "places", "chat", "documents", "settings", "archive", "connections", "admin"];

async function openDemo(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/index.html?demo=1#home");
  await expect(page.locator(".ds-post").first()).toBeVisible();
  return errors;
}

test("all primary pages render without errors, NaN or broken history", async ({ page }) => {
  const errors = await openDemo(page);
  for (const r of PAGES) {
    await page.evaluate((r) => (location.hash = r), r);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.locator("main").innerText(), r).not.toContain("NaN");
  }
  await page.evaluate(() => (location.hash = "person/p0"));
  await expect(page.locator(".ds-profile-hero, .profile-hero").first()).toBeVisible();
  expect(await page.evaluate(() => typeof history.replaceState)).toBe("function");
  expect(errors).toEqual([]);
});

test("names and texts written by people are shown as text, never as markup", async ({ page }) => {
  const errors = await openDemo(page);
  await page.evaluate(() => {
    window.__xss = false;
    state.people[0].name = '<img src=x onerror="window.__xss=true">';
    location.hash = "people";
    render();
  });
  await expect(page.locator("main")).toContainText('<img src=x onerror="window.__xss=true">');
  expect(await page.locator("main img[src=x]").count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBe(false);
  expect(errors).toEqual([]);
});

test("a member sees no management or person editing controls", async ({ page }) => {
  await openDemo(page);
  await page.evaluate(() => {
    state.user.role = "member";
    location.hash = "people";
    render();
  });
  await expect(page.locator("main")).toBeVisible();
  expect(await page.locator('[data-action="add-person"]').count()).toBe(0);
  await page.evaluate(() => handle("menu"));
  await expect(page.locator("#dialog[open]")).toBeVisible();
  await expect(page.locator("#dialog")).not.toContainText("Yönetim paneli");
});
