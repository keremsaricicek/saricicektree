import { test, expect } from "@playwright/test";
import { authFile, openApp } from "./helpers.mjs";

test.use({ storageState: authFile("owner") });

test("menu actions reach their handlers: Kolay görünüm, Avlu view, tree help, notification settings, security", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openApp(page);

  await page.evaluate(() => handle("account"));
  await page.locator("[data-ui=easy]").click();
  await expect(page.locator("body")).toHaveClass(/kn-easy/);
  await page.locator("[data-ui=easy]").click();
  await expect(page.locator("body")).not.toHaveClass(/kn-easy/);
  await page.evaluate(() => dialog.open && dialog.close());

  await page.evaluate(() => {
    location.hash = "gallery";
  });
  await page.locator("[data-view=timeline]").click();
  await expect(page.locator("#hm-gallery")).toHaveClass(/kn-gallery-timeline/);
  await page.locator("[data-view=mosaic]").click();
  await expect(page.locator("#hm-gallery")).toHaveClass(/kn-gallery-mosaic/);

  await page.evaluate(() => {
    location.hash = "tree";
  });
  await page.locator("[data-konak=tree-help]").click();
  await expect(page.locator("#dialog-title")).toHaveText("Soy ağacında gezin");
  await page.evaluate(() => dialog.close());

  await page.evaluate(() => knAction("notice-prefs", document.createElement("button")));
  await expect(page.locator("#kn-notice-prefs")).toBeVisible();
  await page.evaluate(() => dialog.close());

  await page.evaluate(() => archiveHandle("ar-security", document.createElement("button")));
  await expect(page.locator("#dialog[open]")).toBeVisible();
  expect(errors).toEqual([]);
});
