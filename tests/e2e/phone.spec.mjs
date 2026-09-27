import { test, expect } from "@playwright/test";
import { authFile, openApp, apiAs } from "./helpers.mjs";

test.use({ storageState: authFile("ayse") });

test("@phone the keyboard hides the bottom bar in comments and messages without losing focus", async ({ page }) => {
  const { call } = await apiAs("ayse");
  await call("/api/experience/feed", "POST", { clientId: crypto.randomUUID(), body: "Klavye testi", visibility: "family" });
  await openApp(page);
  const input = page.locator(".ds-comment-input textarea, .ds-comment-input input").first();
  await input.focus();
  const size = page.viewportSize();
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) }); // on-screen keyboard
  await expect(page.locator("body")).toHaveClass(/ds-keyboard/);
  await expect(page.locator(".mobile-nav")).toBeHidden();
  await input.blur();
  await page.setViewportSize(size);
  await expect(page.locator("body")).not.toHaveClass(/ds-keyboard/);

  await page.evaluate(() => {
    location.hash = "chat";
  });
  await page.locator("[data-dm-list] .chat-thread").first().click();
  const ta = page.locator(".dm-window:not([hidden]) textarea");
  await ta.focus();
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) });
  await expect(page.locator("body")).toHaveClass(/ds-keyboard/);
  await expect(ta).toBeFocused();
});
