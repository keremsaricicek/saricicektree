import { Capacitor, registerPlugin, CapacitorHttp } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
let watcher = null,
  starting = false;
window.FamilyNative = {
  available: Capacitor.isNativePlatform(),
  async request(path, options) {
    const origin = location.origin;
    const r = await CapacitorHttp.request({
      url: new URL(path, origin).href,
      method: options.method,
      headers: { ...options.headers, Origin: origin },
      ...(options.body ? { data: JSON.parse(options.body) } : {}),
      responseType: "json",
      connectTimeout: 15000,
      readTimeout: 30000,
    });
    return new Response(JSON.stringify(r.data), { status: r.status, headers: { "Content-Type": "application/json" } });
  },
  async startLocation(onLocation, onError, background) {
    if (starting || watcher) throw Error("Konum paylaşımı zaten açık.");
    starting = true;
    try {
      if (background && Capacitor.getPlatform() === "android") {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display !== "granted") throw Error("Arka plan paylaşımı için bildirim izni gerekiyor.");
      }
      watcher = await BackgroundGeolocation.addWatcher(
        {
          requestPermissions: true,
          stale: false,
          distanceFilter: 50,
          ...(background
            ? { backgroundTitle: "Sarıçiçek · Konum paylaşımı açık", backgroundMessage: "Ailen konumunu görebiliyor. Durdurmak için uygulamayı aç." }
            : {}),
        },
        (position, error) => {
          if (error) {
            onError(
              Error(
                error.code === "NOT_AUTHORIZED"
                  ? "Konum izni kapatıldı. Paylaşımı yeniden başlatmak için cihaz ayarlarını kontrol et."
                  : "Konum güncellenemedi.",
              ),
            );
            if (error.code === "NOT_AUTHORIZED") window.dispatchEvent(new Event("family-location-revoked"));
            return;
          }
          onLocation(position);
        },
      );
    } finally {
      starting = false;
    }
  },
  async stopLocation() {
    if (watcher) {
      const id = watcher;
      watcher = null;
      await BackgroundGeolocation.removeWatcher({ id });
    }
  },
  async scheduleReminders(events) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") throw Error("Hatırlatmalar için bildirim izni gerekiyor.");
    const existing = await LocalNotifications.getPending();
    if (existing.notifications.length) await LocalNotifications.cancel(existing);
    const list = events.filter((e) => new Date(e.date + "T09:00:00").getTime() > Date.now()).slice(0, 48);
    await LocalNotifications.schedule({
      notifications: list.map((e, i) => ({
        id: i + 1,
        title: "Sarıçiçek · Aile takvimi",
        body: e.title,
        schedule: { at: new Date(e.date + "T09:00:00") },
        extra: { page: "calendar" },
      })),
    });
  },
};
// Native notifications (FCM on Android, APNs on iOS). The token is handed to the page, which registers
// it with the server for the signed-in account; tapping a notification opens its page.
let pushToken = null,
  pushWaiter = null;
window.FamilyNative.push = {
  platform: Capacitor.getPlatform(),
  async enable() {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") throw Error("Bildirim izni verilmedi. İzni telefonun ayarlarından açabilirsin.");
    if (pushToken) return { token: pushToken, platform: Capacitor.getPlatform() };
    const token = new Promise((resolve, reject) => {
      pushWaiter = { resolve, reject };
      setTimeout(() => reject(Error("Telefon bildirim servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.")), 20000);
    });
    await PushNotifications.register();
    return { token: await token, platform: Capacitor.getPlatform() };
  },
  async disable() {
    pushToken = null;
    await PushNotifications.unregister();
  },
};
if (Capacitor.isNativePlatform()) {
  PushNotifications.addListener("registration", ({ value }) => {
    pushToken = value;
    pushWaiter?.resolve(value);
    pushWaiter = null;
    // A token can also change later; the page re-registers it for the signed-in account.
    window.dispatchEvent(new CustomEvent("family-push-token", { detail: { token: value, platform: Capacitor.getPlatform() } }));
  });
  PushNotifications.addListener("registrationError", (e) => {
    pushWaiter?.reject(Error("Bildirim kaydı yapılamadı: " + (e?.error || "bilinmeyen hata")));
    pushWaiter = null;
  });
  PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const url = String(notification?.data?.url || "");
    // Only in-app pages such as "#chat" or "#post/12".
    if (/^#[a-z]+(\/[\w-]+)?$/.test(url)) location.hash = url.slice(1);
  });
  // Android back button uses the same history as the browser's back gesture: it closes the top
  // window first (see public/ui/navigation.js), then goes back through pages.
  App.addListener("backButton", ({ canGoBack }) => {
    if (document.querySelector("dialog[open]") || canGoBack) history.back();
    else if (location.hash && location.hash !== "#home") location.hash = "home";
    else App.minimizeApp();
  });
  LocalNotifications.addListener("localNotificationActionPerformed", () => {
    location.hash = "calendar";
  });
}
