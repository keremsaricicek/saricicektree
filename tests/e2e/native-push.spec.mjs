// Phone app notifications, page side: with the native layer replaced by a stand-in (no real phone here),
// "Bu telefonda aç" registers the device for the signed-in account and signing out removes it.
import { test, expect } from "@playwright/test";
import { BASE, USERS, openApp } from "./helpers.mjs";

// Its own session: this test signs out, which must not end the shared saved sessions other tests use.
test.use({ storageState: { cookies: [], origins: [] } });
const TOKEN = "fcm-test-token_" + "x".repeat(90);

test("enabling phone notifications registers this device; signing out removes it", async ({ page }) => {
  await page.addInitScript((token) => {
    window.__pushCalls = [];
    Object.defineProperty(window, "FamilyNative", {
      configurable: true,
      get: () => window.__native,
      set: () => {}, // the real bridge only exists in the app
    });
    const push = {
      platform: "android",
      enable: async () => (window.__pushCalls.push("enable"), { token, platform: "android" }),
      disable: async () => window.__pushCalls.push("disable"),
    };
    // The page's own bridge script assigns FamilyNative.push for the browser; keep the stand-in.
    window.__native = Object.defineProperty({ available: true, request: (...a) => fetch(...a) }, "push", { get: () => push, set: () => {} });
  }, TOKEN);
  const login = await page.request.post(BASE + "/api/login", {
    data: { email: USERS.mehmet.email, password: USERS.mehmet.password },
    headers: { origin: BASE },
  });
  expect(login.ok()).toBe(true);
  const deviceCalls = [];
  page.on("request", (r) => r.url().endsWith("/api/notifications/device") && deviceCalls.push(r.method()));
  await openApp(page, "chat");
  // The server has no push account configured in tests: the page says so and keeps the button off.
  await page.evaluate(() => familyPushSettings());
  await expect(page.locator("#dialog")).toContainText("Android bildirimleri henüz kurulmadı");
  await expect(page.locator("#push-enable")).toBeDisabled();
  await page.keyboard.press("Escape");
  // Once configured, enabling registers the device.
  await page.evaluate(() => (window.sfConfig = { ...window.sfConfig, nativePush: { android: true, ios: false } }));
  await page.evaluate(() => familyPushSettings());
  await expect(page.locator("#dialog")).toContainText("Kilit ekranında ad, mesaj metni ya da paylaşım içeriği görünmez");
  await page.locator("#push-enable").click();
  await expect(page.locator("#push-state")).toHaveText("Bu telefonda bildirimler açık.");
  expect(deviceCalls).toEqual(["POST"]);
  await page.keyboard.press("Escape");
  await page.evaluate(() => handle("logout", document.body));
  await expect.poll(() => deviceCalls).toEqual(["POST", "DELETE"]);
  expect(await page.evaluate(() => [window.__pushCalls, localStorage.getItem("sf-native-push")])).toEqual([["enable", "disable"], null]);
});
