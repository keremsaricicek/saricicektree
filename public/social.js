"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const previous = searchDialog;
  searchDialog = function (treeOnly = false) {
    if (treeOnly || demoMode) return previous(treeOnly);
    modal(
      "Aile arşivinde ara",
      '<label class="search" style="width:100%"><input id="server-search" aria-label="Tüm aile arşivinde ara" placeholder="Kişi, şehir, tarih veya hatıra…" autofocus></label><p>Görmeye yetkili olduğun tüm kayıtlar ve belgeler aranır.</p><div id="server-results" role="status"></div>',
    );
    const input = $("#server-search"),
      results = $("#server-results");
    let timer,
      revision = 0;
    async function load(query, offset, version) {
      try {
        const r = await api("/api/search?q=" + encodeURIComponent(query) + "&offset=" + offset);
        if (version !== revision || !input.isConnected) return;
        const html = r.items
          .map(
            (x) =>
              '<button class="search-result" data-action="' +
              esc(x.action) +
              '" data-id="' +
              esc(x.id) +
              '"><span><strong>' +
              esc(x.title) +
              "</strong><small>" +
              esc(x.kind) +
              "</small></span></button>",
          )
          .join("");
        if (!offset) results.innerHTML = html || "<p>Eşleşme bulunamadı.</p>";
        else results.insertAdjacentHTML("beforeend", html);
        if (r.hasMore) {
          const b = document.createElement("button");
          b.className = "btn";
          b.textContent = "Daha fazla sonuç";
          b.onclick = () => {
            b.remove();
            load(query, r.nextOffset, version);
          };
          results.append(b);
        }
      } catch (e) {
        if (version === revision) results.textContent = e.message;
      }
    }
    input.oninput = () => {
      clearTimeout(timer);
      const q = input.value.trim(),
        version = ++revision;
      if (q.length < 2) {
        results.textContent = "En az iki karakter yaz.";
        return;
      }
      results.textContent = "Aranıyor…";
      timer = setTimeout(() => load(q, 0, version), 300);
    };
    input.focus();
  };
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    try {
      if (el.dataset.action === "search-photo") {
        const p = await api("/api/search/photo/" + el.dataset.id);
        if (!state.photos.some((x) => x.id === p.id)) state.photos.push(p);
        el.dataset.action = "photo";
        el.click();
      }
      if (el.dataset.action === "search-document") {
        const r = await fetch("/document/" + encodeURIComponent(el.dataset.id), {
          credentials: "same-origin",
          headers: { "X-Family-Factor": sessionStorage.getItem("sf-factor") || "" },
        });
        if (!r.ok) throw Error("Belgeye erişilemiyor.");
        const url = URL.createObjectURL(await r.blob()),
          a = document.createElement("a");
        a.href = url;
        a.download = "aile-belgesi.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch (err) {
      toast(err.message);
    }
  });
});

async function familyPushSettings() {
  if (demoMode) {
    modal("Telefon bildirimleri", "<p>Bildirimler gerçek hesabınla canlı siteden açılır. Önizleme bildirim göndermez.</p>");
    return;
  }
  if (window.FamilyNative?.available && window.FamilyNative.push) return familyNativePushSettings();
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    modal(
      "Telefon bildirimleri",
      "<p>Bu tarayıcı bildirimleri desteklemiyor. iPhone’da siteyi ana ekrana ekleyip oradan açmayı deneyebilirsin. Yerel mağaza uygulamasının bildirimi ayrıca kurulmalıdır.</p>",
    );
    return;
  }
  modal(
    "Telefon bildirimleri",
    '<p>Yeni mesaj geldiğinde genel bir bildirim gösterilir. Mesajın metni ve gönderenin adı kilit ekranına yazılmaz. E-posta gönderilmez.</p><button class="btn primary" id="push-enable">Bu cihazda aç</button> <button class="btn" id="push-disable">Bu cihazda kapat</button><p id="push-state" role="status"></p>',
  );
  $("#push-enable").onclick = async () => {
    const target = $("#push-state");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw Error("Bildirim izni verilmedi.");
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const key = await api("/api/notifications/key", "POST", {});
      const bytes = Uint8Array.from(atob(key.publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const sub =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
      await api("/api/notifications/subscription", "POST", { endpoint: sub.endpoint });
      target.textContent = "Bu cihaz bildirimlere kaydedildi. Teslimat cihaz ve tarayıcı ayarlarına bağlıdır.";
    } catch (e) {
      target.textContent = e.message;
    }
  };
  $("#push-disable").onclick = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/"),
        sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await api("/api/notifications/subscription", "DELETE", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      $("#push-state").textContent = "Bu cihazın bildirimleri kapalı.";
    } catch (e) {
      $("#push-state").textContent = e.message;
    }
  };
}
// Phone app (Android/iOS): native notifications for messages, tags and comments.
const nativePushKey = "sf-native-push";
function nativePushSaved() {
  try {
    return JSON.parse(localStorage.getItem(nativePushKey) || "null");
  } catch {
    return null; // storage unavailable: treated as not enabled
  }
}
function familyNativePushSettings() {
  const platform = window.FamilyNative.push.platform,
    ready = window.sfConfig?.nativePush?.[platform];
  const saved = nativePushSaved();
  modal(
    "Telefon bildirimleri",
    html`<p>
        Yeni mesaj, bir paylaşımda etiketlenme ve paylaşımına gelen yorum için bildirim gelir. Kilit ekranında ad, mesaj metni ya da paylaşım içeriği görünmez;
        bildirime dokununca ilgili sayfa açılır.
      </p>
      ${ready ? "" : html`<div class="notice">Bu sunucuda ${platform === "ios" ? "iPhone" : "Android"} bildirimleri henüz kurulmadı. Aile yöneticisi bildirim hesabını bağladığında buradan açabilirsin.</div>`}
      <p class="muted">Hangi bildirimleri alacağını Hesabım → Bildirim tercihleri’nden seçebilirsin.</p>
      <div class="form-actions">
        <button class="btn primary" id="push-enable" ${ready ? "" : "disabled"}>Bu telefonda aç</button
        ><button class="btn" id="push-disable">Bu telefonda kapat</button>
      </div>
      <p id="push-state" role="status">${saved?.userId === state?.user?.id ? "Bu telefonda bildirimler açık." : "Bu telefonda bildirimler kapalı."}</p>`,
  );
  $("#push-enable").onclick = async () => {
    const target = $("#push-state");
    target.textContent = "Açılıyor…";
    try {
      const device = await window.FamilyNative.push.enable();
      await api("/api/notifications/device", "POST", device);
      localStorage.setItem(nativePushKey, JSON.stringify({ ...device, userId: state.user.id }));
      target.textContent = "Bu telefonda bildirimler açık.";
    } catch (e) {
      target.textContent = e.message;
    }
  };
  $("#push-disable").onclick = async () => {
    try {
      await familyNativePushOff();
      $("#push-state").textContent = "Bu telefonda bildirimler kapalı.";
    } catch (e) {
      $("#push-state").textContent = e.message;
    }
  };
}
/** Removes this phone from the account (also on sign-out, so the next person gets no one else's notifications). */
async function familyNativePushOff() {
  const saved = nativePushSaved();
  if (!saved) return;
  localStorage.removeItem(nativePushKey);
  await api("/api/notifications/device", "DELETE", { token: saved.token, platform: saved.platform }).catch(() => {}); // signed out already: the server drops it on the next sign-in elsewhere
  await window.FamilyNative?.push?.disable().catch(() => {});
}
// The phone's token can change; re-register it for the account that enabled notifications here.
window.addEventListener("family-push-token", (e) => {
  const saved = nativePushSaved();
  if (!saved || !state?.user || saved.userId !== state.user.id || saved.token === e.detail.token) return;
  api("/api/notifications/device", "POST", e.detail)
    .then(() => localStorage.setItem(nativePushKey, JSON.stringify({ ...e.detail, userId: saved.userId })))
    .catch((err) => window.uiReportError?.("push.token_refresh_failed", err));
});
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="push-settings"]')) familyPushSettings();
});
