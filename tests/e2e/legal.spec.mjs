// Public information pages open without an account, say plainly when the operator's details are not
// yet configured, pass the accessibility check and are linked from sign-in and the account window.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = [
  ["gizlilik.html", "Gizlilik"],
  ["hesap-silme.html", "Hesabını silme"],
  ["destek.html", "Destek"],
];

test.use({ storageState: { cookies: [], origins: [] } });

for (const [file, heading] of PAGES)
  test(`${file} is public, complete about missing settings and accessible`, async ({ page }) => {
    const res = await page.goto("/" + file);
    expect(res.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    // The test server has no SUPPORT_EMAIL: the page must say so instead of inventing an address.
    await expect(page.locator("[data-fill=supportEmail]").first()).toHaveText("(destek adresi henüz tanımlanmadı)");
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations.map((v) => v.id)).toEqual([]);
  });

test("the sign-in screen links to the information pages", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Gizlilik", "Destek", "Hesap silme"]) await expect(page.getByRole("link", { name })).toBeVisible();
  await page.getByRole("link", { name: "Hesap silme" }).click();
  await expect(page).toHaveURL(/hesap-silme\.html$/);
});
