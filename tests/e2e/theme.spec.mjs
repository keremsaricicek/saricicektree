import { test, expect } from "@playwright/test";
import { authFile, openApp } from "./helpers.mjs";

test.use({ storageState: authFile("ayse") });

test("Koyu is remembered after reload and Sistem follows the device", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => handle("account"));
  await page.locator("[data-ui=theme][data-theme=dark]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await page.waitForFunction(() => typeof state !== "undefined" && state?.user);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => handle("account"));
  await page.locator("[data-ui=theme][data-theme=system]").click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
