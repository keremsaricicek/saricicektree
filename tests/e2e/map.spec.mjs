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

test("zooming in brings the full outline; if it cannot load, the light outline stays and the next zoom retries", async ({ page }) => {
  const detail = [];
  page.on("request", (r) => r.url().includes("world-map-detail.js") && detail.push(r.url()));
  let fail = true;
  await page.route("**/assets/world-map-detail.js", (route) => (fail ? route.abort() : route.continue()));
  await openApp(page, "places");
  await expect(page.locator("#family-map .leaflet-overlay-pane canvas")).toBeAttached();
  expect(detail).toEqual([]); // the world view uses the light outline only
  const countries = () => page.evaluate(() => Object.keys(familyMap._layers).filter((k) => familyMap._layers[k].feature).length);
  expect(await countries()).toBe(241);

  await page.evaluate(() => void familyMap.setZoom(5, { animate: false }));
  await expect.poll(() => detail.length).toBe(1);
  expect(await page.evaluate(() => !!window.FamilyWorldDetail)).toBe(false);
  expect(await countries()).toBe(241); // still the light outline, nothing missing

  fail = false;
  await page.evaluate(() => void familyMap.setZoom(3, { animate: false }));
  await page.evaluate(() => void familyMap.setZoom(5, { animate: false }));
  await expect.poll(() => page.evaluate(() => !!window.FamilyWorldDetail)).toBe(true);
  await expect.poll(countries).toBe(241); // replaced, not added on top
});
