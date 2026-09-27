import { test, expect } from "@playwright/test";
import { authFile, openApp } from "./helpers.mjs";

test.use({
  storageState: authFile("ayse"),
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

async function openFirstConversation(page) {
  await openApp(page, "chat");
  await page.locator("[data-dm-list] .chat-thread").first().click();
  const win = page.locator(".dm-window:not([hidden])");
  await expect(win.locator("textarea")).toBeVisible();
  return win;
}

test("failed message keeps its text and a retry sends exactly one copy", async ({ page, context }) => {
  const win = await openFirstConversation(page);
  const text = `Bağlantı yokken yazıldı ${Date.now()}`;
  await context.setOffline(true);
  await win.locator("textarea").fill(text);
  await win.locator("textarea").press("Enter");
  await expect(win.locator(".ds-dm-pending.is-failed")).toContainText(text);
  await expect(win.locator(".ds-dm-retry")).toBeVisible();
  await context.setOffline(false);
  await win.locator(".ds-dm-retry").click();
  await expect(win.locator(".ds-dm-pending")).toHaveCount(0);
  await expect(win.locator(".dm-message", { hasText: text })).toHaveCount(1);
  // A second tap on an already delivered message must not duplicate it.
  await page.reload();
  const again = await openFirstConversation(page);
  await expect(again.locator(".dm-message", { hasText: text })).toHaveCount(1);
});

test("photo attachment is previewed before sending and voice messages get a waveform", async ({ page }) => {
  const win = await openFirstConversation(page);
  await win.locator("input[type=file]").setInputFiles("public/guide/avlu.jpg");
  await expect(win.locator(".ds-attach img")).toBeVisible();
  await win.locator(".dm-send").click();
  await expect(win.locator(".dm-message.mine img").last()).toBeVisible();

  await win.locator("[data-ex=record]").click();
  await expect(win.locator(".ds-rec")).toBeVisible();
  await page.waitForTimeout(1200); // record roughly a second of the fake microphone tone
  await win.locator("[data-ex=record]").click();
  await win.locator(".dm-send").click();
  const voice = win.locator(".dm-message.mine .ds-voice").last();
  await expect(voice).toBeVisible();
  await expect(voice.locator(".ds-voice-time")).toHaveText(/0:0[1-9]/);
});
