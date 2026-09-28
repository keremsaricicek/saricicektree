// GEDCOM in the browser: preview (unsupported facts and skipped records are listed), import, export.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { authFile, openApp } from "./helpers.mjs";

test.use({ storageState: authFile("owner") });

test("a GEDCOM file is previewed, imported and exported again", async ({ page }) => {
  await openApp(page, "tree");
  await page.getByRole("button", { name: "GEDCOM" }).click();
  await page.setInputFiles("#gedcom-file", "tests/fixtures/sample.ged");
  const preview = page.locator("#gedcom-preview");
  await expect(preview).toContainText("3 kişi, 3 bağ bulundu");
  await expect(preview).toContainText("Meslek: 1 kayıt");
  await expect(preview).toContainText("görsel/dosya 1");
  await expect(preview.locator("summary")).toContainText("uyarı");
  await preview.getByRole("button", { name: "İçe aktar" }).click();
  await expect(preview.getByRole("status")).toContainText("3 kişi eklendi");
  await page.keyboard.press("Escape");
  await expect(page.locator("main")).toContainText("HaticeTarihçe1931"); // tree card: first name, surname, birth year

  await page.getByRole("button", { name: "GEDCOM" }).click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Ağacı dışa aktar/ }).click()]);
  expect(file.suggestedFilename()).toMatch(/^saricicek-soyagaci-\d{4}-\d{2}-\d{2}\.ged$/);
  const text = readFileSync(await file.path(), "utf8");
  expect(text).toContain("1 NAME Hatice /Tarihçe/");
  expect(text).toContain("2 DATE 3 APR 1931");
  expect(text).toMatch(/GEDCOM'dan:[\s\S]*Meslek: Terzi/);
});
