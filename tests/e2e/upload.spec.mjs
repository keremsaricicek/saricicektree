import { test, expect } from "@playwright/test";
import { authFile, apiAs, fillUpload } from "./helpers.mjs";

test.use({ storageState: authFile("owner") });

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

test("copies are finished by the server even when the page is closed right after the upload", async ({ page }) => {
  const title = `Sayfa kapandı ${Date.now()}`;
  await fillUpload(page, "public/assets/archive.webp", title);
  await page.click("#kn-upload-submit");
  await expect(page.locator("dialog[open] #hm-upload-form")).toHaveCount(0, { timeout: 30_000 });
  await page.close(); // nothing in the browser is left to make the copies
  await expect.poll(async () => (await byTitle(title))[0]?.media?.status, { timeout: 30_000 }).toBe("ready");
  expect((await byTitle(title))[0].media.variants).toEqual([320, 640, 1080]);
});
