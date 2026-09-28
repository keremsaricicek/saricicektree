// Voice comments in Hayat with Chromium's fake microphone: record, listen, send; a failed send keeps
// the recording and a retry stores exactly one comment; cancel; a refused microphone is explained.
import { test, expect } from "@playwright/test";
import { apiAs, authFile, openApp } from "./helpers.mjs";

test.use({ storageState: authFile("ayse"), launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

async function newPost(text) {
  const ayse = await apiAs("ayse");
  return (await ayse.call("/api/experience/feed", "POST", { body: text, visibility: "family", clientId: crypto.randomUUID(), peopleIds: [] })).body.id;
}
async function record(page, card) {
  await card.locator('[data-ui="voice-start"]').click();
  await expect(card.locator(".ds-voice.is-recording")).toBeVisible();
  await expect(card.locator("[data-voice-time]")).toHaveText(/0:0[1-9]/); // at least a second of sound
  await card.locator('[data-ui="voice-stop"]').click();
  await expect(card.locator(".ds-voice audio")).toBeVisible();
}

test("record, listen, send; a failed send keeps the recording and a retry stores one comment", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  const post = await newPost("Sesli yorum denemesi " + Date.now());
  await openApp(page, "home");
  const card = page.locator(`[data-feed-card="${post}"]`);
  await expect(card).toBeVisible();
  await record(page, card);
  expect(await card.locator(".ds-voice audio").evaluate((a) => a.src.startsWith("blob:"))).toBe(true);

  let failOnce = true;
  await page.route(`**/api/experience/feed/${post}/comments`, (route) => {
    if (route.request().method() === "POST" && failOnce) {
      failOnce = false;
      return route.abort();
    }
    return route.continue();
  });
  await card.locator(".ds-send").click();
  await expect(card.locator(".ds-comment-error")).toContainText("ses kaydın korunuyor");
  await expect(card.locator(".ds-voice audio")).toBeVisible();
  await card.locator(".ds-send").click();
  const played = card.locator(".ds-voice-comment audio");
  await expect(played).toHaveCount(1);
  await expect(card.locator(".ds-voice")).toHaveCount(0);
  const src = await played.getAttribute("src");
  const response = await page.request.get(src);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^audio\//);
  const ayse = await apiAs("ayse");
  expect((await ayse.call(`/api/experience/feed/${post}/comments`)).body.items.filter((c) => c.audio)).toHaveLength(1);
});

test("a recording can be deleted before sending", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  const post = await newPost("Vazgeçme denemesi " + Date.now());
  await openApp(page, "home");
  const card = page.locator(`[data-feed-card="${post}"]`);
  await record(page, card);
  await card.getByRole("button", { name: "Kaydı sil" }).click();
  await expect(card.locator(".ds-voice")).toHaveCount(0);
  await expect(card.locator('[data-ui="voice-start"]')).toBeFocused();
});

test("a refused microphone is explained", async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile("ayse") }); // no fake-ui flag: permission is refused
  const page = await context.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
  });
  const post = await newPost("İzin denemesi " + Date.now());
  await openApp(page, "home");
  await page.locator(`[data-feed-card="${post}"] [data-ui="voice-start"]`).click();
  await expect(page.locator("#toast")).toContainText("Mikrofon izni verilmedi");
  await context.close();
});
