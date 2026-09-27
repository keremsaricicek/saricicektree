// Admin panel "Kullanım ve durum": real counts for the owner, no message text, clear backup state.
import { test, expect } from "@playwright/test";
import { apiAs, authFile, openApp } from "./helpers.mjs";

test.use({ storageState: authFile("owner") });

test("the owner sees usage, storage and backup state without any message text", async ({ page }) => {
  const ayse = await apiAs("ayse");
  const mehmetId = (await (await apiAs("mehmet")).call("/api/me")).body.user.id;
  await ayse.call("/api/experience/conversations/dm/" + mehmetId, "POST", { body: "Panelde görünmemesi gereken özel mesaj", clientId: crypto.randomUUID() });
  await openApp(page, "admin");
  const panel = page.locator("#ds-usage");
  await expect(panel.getByRole("heading", { name: "Kullanım ve durum" })).toBeVisible();
  await expect(panel.locator(".ds-usage-tile").first()).toContainText("aktif üye");
  await expect(panel).toContainText("Özel mesaj");
  await expect(panel).toContainText("Toplam dosya");
  await expect(panel.getByRole("alert")).toContainText("Tam yedek kapalı");
  await expect(panel).not.toContainText("Panelde görünmemesi gereken");
});
