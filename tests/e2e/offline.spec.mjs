// Opt-in offline reading: off by default; when turned on, the last Hayat page and the family tree open without a
// connection under a clear notice, messages are never kept, and signing out removes the copy from the device.
import { test, expect } from "@playwright/test";
import { BASE, USERS, apiAs, authFile, openApp } from "./helpers.mjs";

// Its own session: this test signs out, which must not end the shared saved sessions other tests use.
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "allow" });

const saved = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("sf-offline", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("responses", { keyPath: "path" });
        r.onsuccess = () => {
          const q = r.result.transaction("responses").objectStore("responses").getAll();
          q.onsuccess = () => resolve(q.result);
        };
      }),
  );

test("offline reading keeps Hayat and the tree on this device, shows a notice, and is removed on sign-out", async ({ page, context }) => {
  const text = "Çevrimdışı okunacak paylaşım " + Date.now();
  const mehmet = await apiAs("mehmet");
  await mehmet.call("/api/experience/feed", "POST", { body: text, visibility: "family", clientId: crypto.randomUUID(), peopleIds: [] });
  const login = await page.request.post(BASE + "/api/login", { data: { email: USERS.ayse.email, password: USERS.ayse.password }, headers: { origin: BASE } });
  expect(login.ok()).toBe(true);
  await openApp(page, "home");
  await expect(page.getByText(text)).toBeVisible();
  expect(await saved(page)).toEqual([]); // nothing is kept until the member chooses to

  await page.evaluate(() => uiOfflineSettings());
  await expect(page.locator("#dialog")).toContainText("Mesajlar ve sohbetler hiçbir zaman saklanmaz");
  await page.locator('#dialog [data-action="offline-on"]').click();
  await expect(page.locator("#toast")).toContainText("Çevrimdışı okuma açıldı");
  const paths = (await saved(page)).map((x) => x.path);
  expect(paths).toEqual(expect.arrayContaining(["/api/me", "/api/bootstrap", "/api/experience/feed?"]));
  expect(paths.some((p) => p.includes("chat") || p.includes("conversation"))).toBe(false);
  expect(JSON.stringify(await saved(page))).not.toContain('"csrf"');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the service worker see the app's own files once
  await expect(page.getByText(text)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#offline-bar")).toContainText("Çevrimdışısın");
  await expect(page.getByText(text)).toBeVisible();
  await page.evaluate(() => (location.hash = "tree"));
  await expect(page.locator("#offline-bar")).toBeVisible();
  await expect(page.locator(".tree-node, [data-person], .ds-tree-node").first()).toBeVisible();

  // Back online: the page starts again from the server and the notice goes away.
  await context.setOffline(false);
  await expect(page.locator("#offline-bar")).toHaveCount(0, { timeout: 15_000 });

  // Signing out removes the copy and the choice.
  await openApp(page, "home");
  await page.evaluate(() => document.querySelector('[data-action="account"]')?.click());
  await page.locator('#dialog [data-action="logout"]').click();
  await expect(page.locator("#login-form")).toBeVisible();
  expect(await saved(page)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("sf-offline-reading"))).toBeNull();
  expect(await page.evaluate(async () => (await caches.keys()).includes("sf-offline-media"))).toBe(false);
});

test.describe("without the choice", () => {
  test.use({ storageState: authFile("ayse") });
  test("no connection shows the plain notice and nothing is read from the device", async ({ page, context }) => {
    await openApp(page, "home");
    await context.setOffline(true);
    await page.evaluate(() => dispatchEvent(new Event("offline")));
    await expect(page.locator("#offline-bar")).toContainText("Bağlantı yok");
    expect(await page.evaluate(() => uiOfflineRead("/api/bootstrap"))).toBeNull();
    await context.setOffline(false);
    await page.evaluate(() => dispatchEvent(new Event("online")));
    await expect(page.locator("#offline-bar")).toHaveCount(0);
  });
});
