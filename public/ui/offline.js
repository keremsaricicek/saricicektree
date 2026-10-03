"use strict";
/* Opt-in offline reading. When a member turns it on for this device, the answers that draw Hayat's first page and
   the family tree are kept in IndexedDB (with small copies of their photos in Cache Storage). With no connection,
   api() answers those reads from the saved copy, so the same pages render read-only under a clear notice.
   Messages are never kept. Signing out, deleting the account or turning it off removes everything. */
const UI_OFFLINE_FLAG = "sf-offline-reading";
const UI_OFFLINE_MEDIA = "sf-offline-media";
const UI_OFFLINE_READS = [
  "/api/config",
  "/api/me",
  "/api/bootstrap",
  "/api/archive/entries",
  "/api/archive/groups",
  "/api/experience/feed?",
  "/api/experience/preferences",
  "/api/experience/portraits",
  "/api/experience/me",
];
let uiOfflineSince = null; // when the copy on screen was saved, while the page shows it

function uiOfflineOn() {
  try {
    return localStorage.getItem(UI_OFFLINE_FLAG) === "1";
  } catch {
    return false;
  }
}
function uiOfflineDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("sf-offline", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("responses", { keyPath: "path" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function uiOfflineStore(mode, fn) {
  const db = await uiOfflineDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("responses", mode),
        r = fn(tx.objectStore("responses"));
      tx.oncomplete = () => resolve(r?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Called by api() after every successful read: keeps the ones Hayat and the tree need, for this account only. */
async function uiOfflineKeep(path, body) {
  if (!uiOfflineOn() || demoMode || uiOfflineSince || !UI_OFFLINE_READS.includes(path)) return;
  try {
    if (path === "/api/me") {
      const saved = await uiOfflineStore("readonly", (s) => s.get("/api/me"));
      // Another account signed in on this device: the previous copy is not theirs to read.
      if (saved && saved.body.user?.id !== body.user?.id) await uiOfflineForget({ keepChoice: true });
      body = { user: body.user }; // the session's CSRF token is never stored
    }
    await uiOfflineStore("readwrite", (s) => s.put({ path, body, savedAt: new Date().toISOString() }));
    const photos =
      path === "/api/experience/feed?"
        ? (body.items || []).flatMap((p) => (p.images || []).map((x) => x.url + "?w=640"))
        : path === "/api/experience/portraits"
          ? (body.items || []).map((x) => x.url + "?w=320")
          : [];
    if (photos.length && window.caches) {
      const cache = await caches.open(UI_OFFLINE_MEDIA);
      for (const url of photos.slice(0, 60)) if (!(await cache.match(url))) await cache.add(url).catch(() => {});
    }
  } catch {
    // Saving a copy is a convenience; reading online never depends on it.
  }
}
/** Called by api() when a read fails for lack of a connection: the saved answer, or null. */
async function uiOfflineRead(path) {
  if (!uiOfflineOn() || demoMode || !UI_OFFLINE_READS.includes(path)) return null;
  const saved = await uiOfflineStore("readonly", (s) => s.get(path)).catch(() => null);
  if (!saved) return null;
  if (!uiOfflineSince || saved.savedAt < uiOfflineSince) uiOfflineSince = saved.savedAt;
  uiOfflineBar();
  return structuredClone(saved.body);
}
/** Removes the saved copy (and, unless kept, the member's choice) from this device. */
async function uiOfflineForget({ keepChoice = false } = {}) {
  if (!keepChoice)
    try {
      localStorage.removeItem(UI_OFFLINE_FLAG);
    } catch {
      // Storage blocked: there is no choice saved to remove.
    }
  await uiOfflineStore("readwrite", (s) => s.clear()).catch(() => {});
  if (window.caches) await caches.delete(UI_OFFLINE_MEDIA).catch(() => {});
}

/** The notice at the top of the page while there is no connection. */
function uiOfflineBar() {
  let bar = $("#offline-bar");
  const offline = !navigator.onLine || uiOfflineSince;
  if (!offline) return bar?.remove();
  if (!bar) {
    document.body.insertAdjacentHTML("afterbegin", '<div id="offline-bar" class="ds-offline-bar" role="status"></div>');
    bar = $("#offline-bar");
  }
  bar.innerHTML = uiOfflineSince
    ? String(
        html`${raw(icon("wifi-off"))}<span
            ><strong>Çevrimdışısın.</strong> ${uiFullDate(uiOfflineSince)} tarihinde bu cihaza kaydedilen akış ve soy ağacı gösteriliyor. Bağlantı gelince sayfa
            yenilenir; o zamana kadar değişiklik yapılamaz.</span
          >`,
      )
    : String(html`${raw(icon("wifi-off"))}<span><strong>Bağlantı yok.</strong> Yazdıkların korunur; bağlantı gelince yeniden dene.</span>`);
  hydrate();
}
addEventListener("offline", uiOfflineBar);
addEventListener("online", () => {
  // The page shows a saved copy without a live session: start again from the server.
  if (uiOfflineSince) return location.reload();
  uiOfflineBar();
});

async function uiOfflineSettings() {
  const on = uiOfflineOn(),
    saved = on ? await uiOfflineStore("readonly", (s) => s.getAll()).catch(() => []) : [],
    last = saved.map((x) => x.savedAt).sort()[0];
  modal(
    "Çevrimdışı okuma",
    String(
      html`<div class="ds-offline-info">
        <p>
          Açarsan bu cihaz, en son baktığın <strong>Hayat akışının ilk sayfasını</strong> ve <strong>soy ağacını</strong> küçük fotoğraf kopyalarıyla birlikte
          saklar. Bağlantı olmadığında bunları okuyabilirsin; değişiklik yapılamaz.
        </p>
        <ul>
          <li>Kayıt yalnız bu cihazda, tarayıcının ya da uygulamanın deposunda durur; şifrelenmez. Ortak kullanılan bir cihazda açma.</li>
          <li>Mesajlar ve sohbetler hiçbir zaman saklanmaz.</li>
          <li>Oturumu kapattığında, hesabını sildiğinde ya da bu ayarı kapattığında kayıt cihazdan silinir.</li>
        </ul>
        ${on ? html`<p class="ds-offline-state" role="status">${last ? "Son kayıt: " + uiFullDate(last) : "İlk kayıt, akışı ya da soy ağacını açtığında yapılır."}</p>` : ""}
        <div class="form-actions">
          ${on ? raw(button("Kapat ve cihazdan sil", "offline-off", "trash-2")) : raw(button("Bu cihazda aç", "offline-on", "download", "primary"))}
        </div>
      </div>`,
    ),
  );
}
async function uiOfflineSwitch(on) {
  if (!on) {
    await uiOfflineForget();
    closeModal();
    return toast("Çevrimdışı okuma kapatıldı; kayıt bu cihazdan silindi.");
  }
  if (!window.indexedDB) return toast("Bu tarayıcı çevrimdışı kaydı desteklemiyor.");
  try {
    localStorage.setItem(UI_OFFLINE_FLAG, "1");
  } catch {
    return toast("Bu tarayıcıda cihaz deposu kapalı; çevrimdışı okuma açılamadı.");
  }
  // The service worker keeps the app's own files so the page can open without a connection.
  await navigator.serviceWorker?.register("/sw.js").catch(() => {});
  closeModal();
  await Promise.all(UI_OFFLINE_READS.map((path) => api(path).catch(() => null)));
  toast("Çevrimdışı okuma açıldı. Akış ve soy ağacı bu cihazda saklanıyor.");
}
