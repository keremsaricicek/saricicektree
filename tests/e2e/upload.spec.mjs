import { test, expect } from "@playwright/test";
import { authFile, openApp, apiAs } from "./helpers.mjs";

test.use({ storageState: authFile("owner") });

async function fillUpload(page, file, title) {
  await openApp(page, "gallery");
  await page.evaluate(() => hmUpload(true));
  await page.setInputFiles("#hm-files", file);
  await expect(page.locator("#hm-upload-form [name=title]")).toBeVisible();
  await page.evaluate((title) => {
    const f = document.querySelector("#hm-upload-form");
    f.querySelector("[name=title]").value = title;
    f.querySelector("[name=date]").value = "1985-06-19";
    f.querySelector("[name=place]").value = "Halfeti";
    f.querySelector("[name=description]").value = "Test hatırası";
    f.querySelector("[name=peopleIds]").checked = true;
    f.dispatchEvent(new Event("input", { bubbles: true }));
  }, title);
  await page.evaluate(() => knAction("upload-next"));
  await page.evaluate(() => knAction("upload-next"));
  await expect(page.locator("#kn-upload-submit")).toBeVisible();
}

const byTitle = async (title) => {
  const { call } = await apiAs("owner");
  return (await call("/api/experience/memories")).body.items.filter((x) => x.title === title);
};

test("a real photo is stored whole and gets smaller copies that are never larger than the source", async ({ page }) => {
  const title = `Gerçek görsel ${Date.now()}`;
  await fillUpload(page, "public/assets/heritage.webp", title);
  await page.click("#kn-upload-submit");
  await expect(page.locator("dialog[open] #hm-upload-form")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await byTitle(title))[0]?.media?.variants, { timeout: 30_000 }).toEqual([320, 640, 1080]);
  const [photo] = await byTitle(title);
  expect([photo.media.width, photo.media.height]).toEqual([1536, 1024]);
  const { call } = await apiAs("owner");
  const original = (await call(photo.url)).body.length;
  const small = (await call(photo.url + "?w=320")).body.length;
  expect(small).toBeLessThan(original / 10);
});

test("an upload cut off mid-way keeps the form and a retry stores exactly one photo", async ({ page }) => {
  const title = `Kesinti ${Date.now()}`;
  await fillUpload(page, "public/guide/avlu.jpg", title);
  let first = true;
  await page.route("**/api/experience/memories", (route) => {
    if (route.request().method() === "POST" && first) {
      first = false;
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await page.click("#kn-upload-submit");
  await expect(page.locator("#hm-upload-form .form-error")).toContainText("korunuyor");
  await expect(page.locator("#kn-upload-submit")).toHaveText("Yeniden dene");
  await expect(page.locator("#hm-upload-form [name=title]")).toHaveValue(title);
  await page.click("#kn-upload-submit");
  await expect(page.locator("dialog[open] #hm-upload-form")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await byTitle(title)).length).toBe(1);
});

test("when the smaller copies cannot be saved the person is told and the photo is marked for completion", async ({ page }) => {
  test.fail(true, "known bug: copy failures are swallowed");
  const title = `Kopya hatası ${Date.now()}`;
  await fillUpload(page, "public/assets/archive.webp", title);
  await page.route("**/variants", (route) => route.fulfill({ status: 500, body: '{"error":"test"}', contentType: "application/json" }));
  await page.click("#kn-upload-submit");
  // The original is saved; the failure to optimise is visible, not silent.
  await expect(page.locator("#ds-upload-progress")).toContainText("Fotoğraf kaydedildi; küçük kopyalar daha sonra tamamlanacak", { timeout: 30_000 });
  await expect(page.locator("#ds-upload-progress")).toHaveClass(/is-warning/);
  await expect.poll(async () => (await byTitle(title)).length).toBe(1);
  const { call } = await apiAs("owner");
  const missing = (await call("/api/experience/memories/variants/missing")).body.items.map((x) => x.id);
  const [photo] = await byTitle(title);
  expect(missing).toContain(photo.id);
});
