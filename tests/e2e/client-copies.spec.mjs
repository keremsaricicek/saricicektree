// Runs against the second test server (MEDIA_JOBS=off): the browser makes the smaller copies,
// as on the Cloudflare runtime. A failure must be visible and the photo must stay listed.
import { test, expect } from "@playwright/test";
import { fillUpload } from "./helpers.mjs";

const STATE = "tests/e2e/.auth/owner-client-copies.json"; // written by global-setup

test.use({ storageState: STATE });

async function missingList(page) {
  return page.evaluate(async () => await (await fetch("/api/experience/memories/variants/missing")).json());
}

test("@client-copies a copy failure is shown, reported and leaves the photo listed for completion", async ({ page }) => {
  const title = `Kopya hatası ${Date.now()}`;
  await fillUpload(page, "public/assets/archive.webp", title);
  await page.route("**/variants", (route) => route.fulfill({ status: 500, body: '{"error":"test"}', contentType: "application/json" }));
  const reported = page.waitForRequest((r) => r.url().endsWith("/api/experience/ops/client-error"));
  await page.click("#kn-upload-submit");
  await expect(page.locator("#toast")).toContainText("Fotoğraf kaydedildi; küçük kopyalar daha sonra tamamlanacak");
  expect(JSON.parse((await reported).postData()).event).toBe("photo.variants_failed");
  const list = await missingList(page);
  expect(list.optimizer).toBe("client");
  expect(list.items.length).toBeGreaterThan(0);
});

test("@client-copies without failures the browser stores the copies and the photo becomes ready", async ({ page }) => {
  const title = `Tarayıcı kopyası ${Date.now()}`;
  await fillUpload(page, "public/assets/heritage.webp", title);
  await page.click("#kn-upload-submit");
  await expect(page.locator("dialog[open] #hm-upload-form")).toHaveCount(0, { timeout: 30_000 });
  const photo = await page.evaluate(async (title) => {
    const r = await (await fetch("/api/experience/memories")).json();
    return r.items.find((x) => x.title === title);
  }, title);
  expect([photo.media.status, photo.media.variants]).toEqual(["ready", [320, 640, 1080]]);
});
