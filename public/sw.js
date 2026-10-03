// Notifications, and the app's own public files for opening without a connection.
// Private API answers are never cached here. Photos are served offline only from the copy a member chose to keep
// on this device ("Çevrimdışı okuma", ui/offline.js), which signing out removes.
const SHELL = "sf-shell-v1";
const shellFile = (url) =>
  url.origin === self.location.origin &&
  (url.pathname === "/" || url.pathname === "/index.html" || /^\/(min|assets)\//.test(url.pathname) || /\.(css|webmanifest)$/.test(url.pathname));
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate" && !(url.pathname === "/" || url.pathname === "/index.html")) return;
  if (req.mode === "navigate" || shellFile(url))
    // Network first, so a new release is used at once; the stored copy only when the network fails.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req.mode === "navigate" ? "/" : req, { cacheName: SHELL })) || Response.error()),
    );
  else if (url.pathname.startsWith("/media/"))
    event.respondWith(fetch(req).catch(async () => (await caches.match(req, { cacheName: "sf-offline-media", ignoreSearch: true })) || Response.error()));
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) =>
  event.waitUntil(
    self.registration.showNotification("Sarıçiçek · Yeni mesaj", {
      body: "Ailenden bir mesaj var. Görmek için sohbeti aç.",
      tag: "family-message",
      data: { url: "/#chat" },
    }),
  ),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const tabs = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
      if (tab) {
        await tab.navigate("/#chat");
        await tab.focus();
      } else await clients.openWindow("/#chat");
    })(),
  );
});
