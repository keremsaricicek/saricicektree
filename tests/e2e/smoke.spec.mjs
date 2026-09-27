import { test, expect } from "@playwright/test";
import { authFile } from "./helpers.mjs";

test.use({ storageState: authFile("ayse") });

test("signed-in member reaches Hayat without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#home");
  await expect(page.locator('.ds-composer, .ff-composer, [data-ui="compose"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});
