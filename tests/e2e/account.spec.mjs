// "Verilerimi indir" in the account window downloads the member's own data as one JSON file.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { authFile, openApp, USERS } from "./helpers.mjs";

test.use({ storageState: authFile("ayse") });

test("a member downloads their own data from the account window", async ({ page }) => {
  await openApp(page, "home");
  await page.evaluate(() => handle("account", document.querySelector("[data-action=account]")));
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Verilerimi indir/ }).click()]);
  expect(file.suggestedFilename()).toMatch(/^saricicek-verilerim-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync(await file.path(), "utf8"));
  expect(data.account.email).toBe(USERS.ayse.email);
  expect(JSON.stringify(data)).not.toContain(USERS.mehmet.email);
  expect(JSON.stringify(data)).not.toContain(USERS.owner.email);
});
