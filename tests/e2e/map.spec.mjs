// The map files (~0.9 MB) load only when a map screen opens; a failed download is reported and retried.
import { test, expect } from "@playwright/test";
import { authFile, openApp } from "./helpers.mjs";

test.use({ storageState: authFile("owner") });
const isMapFile = (url) => /\/assets\/(leaflet|world-map)\.js/.test(url);

test("the family map downloads its files only on the map page", async ({ page }) => {
  const requested = [];
  page.on("request", (r) => isMapFile(r.url()) && requested.push(r.url()));
  await openApp(page, "home");
  await openApp(page, "gallery");
  expect(requested).toEqual([]);
  await page.evaluate(() => (location.hash = "places"));
  await expect(page.locator("#family-map .leaflet-overlay-pane canvas")).toBeAttached();
  expect(requested).toHaveLength(2);
});

test("a failed map download says so and the next visit loads it", async ({ page }) => {
  await page.route(isMapFile, (route) => route.abort());
  await openApp(page, "places");
  await expect(page.locator("#map-connection")).toHaveText(/Harita dosyası yüklenemedi/);
  await page.unroute(isMapFile);
  await page.evaluate(() => (location.hash = "home"));
  await page.evaluate(() => (location.hash = "places"));
  await expect(page.locator("#family-map .leaflet-overlay-pane canvas")).toBeAttached();
});
