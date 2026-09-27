// Demo mode and the single-file export run without a server session; they broke once without
// any server test noticing, so they have their own checks.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROUTES = ["home", "gallery", "tree", "people", "calendar", "history", "chat", "archive", "admin"];

async function walk(page, url) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.locator(".ds-post").first()).toBeVisible();
  for (const r of ROUTES) {
    await page.evaluate((r) => (location.hash = r), r);
    await expect(page.locator("main")).toBeVisible();
  }
  await page.evaluate(() => (location.hash = "gallery"));
  await page.locator(".hm-tile").first().click();
  await expect(page.locator("#dialog[open]")).toBeVisible();
  expect(errors).toEqual([]);
}

test("demo mode renders every main page without script errors", async ({ page }) => {
  await walk(page, "/index.html?demo=1#home");
});

test("the single-file export opens offline and works", async ({ page, context }) => {
  const file = resolve("exports/Saricicek-Family.html");
  if (!existsSync(file) || process.env.CI) execFileSync(process.execPath, ["src/build-html.mjs"], { stdio: "ignore" });
  await context.route(/^https?:/, (route) => route.abort()); // nothing may come from the network
  await walk(page, "file://" + file + "#home");
});
