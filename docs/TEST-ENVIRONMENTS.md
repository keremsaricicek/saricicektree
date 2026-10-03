# Deneme ortamları

Üç farklı şey var. Birbirinin yerine geçmezler.

| Tür | Nedir | Nerede | Gerçek aile verisi |
| --- | --- | --- | --- |
| **Web görünüm önizlemesi** | Uygulamanın tarayıcıda, seçilen ekran boyutunda çizilmesi. İşletim sistemi yok: telefon klavyesi, geri hareketi, bildirim, kamera yok. | Tek bağlantı (aşağıda) ya da `exports/Saricicek-Family.html` | Yok, örnek aile |
| **İşletim sistemi simülatörü** | Gerçek Android ve iOS uygulama paketinin emülatörde/simülatörde açılması. | GitHub Actions → "Mobile build checks"; Appetize (hesap gerekir) | Yok, `demo` paketleri örnek aileyle gelir |
| **Gerçek cihaz** | Telefona kurulan uygulama. | Henüz denenmedi | — |

## 1. Tek bağlantı: web görünüm önizlemesi

- Bağlantı: https://claude.ai/artifact/NnABp45JUHWb9SaK3FpCtA (şimdilik yalnız sahibine açık; başkaları için sayfanın
  **Paylaş** menüsünden paylaşılmalı).
- Açınca sol tarafta **Telefon / Tablet / Masaüstü** seçimi, sürüm bilgisi (uygulama sürümü, commit, dal, derleme
  tarihi) ve kısa deneme adımları vardır.
- İçindeki uygulama `npm run build:html` çıktısıdır: örnek aile, sunucuya bağlanmaz; beğeni, yorum vb. yalnız o
  tarayıcıda kalır.
- Güncellemek için: `npm run build:html`, sonra `exports/Saricicek-Family.html` dosyası sayfanın `app.html`
  dosyası olarak yeniden yayınlanır ve sürüm satırı güncellenir.

Kısa deneme adımları: ekran boyutunu seç → Hayat'ta beğen, yorum yaz, tepki ver → Soy Ağacı'nda bir kişiye dokun,
sürükle → Avlu'da fotoğraf aç, kaydır → ızgara simgesinden diğer bölümler → hesap menüsünden koyu tema.

## 2. Android ve iOS simülatörü

Her `main` dışı push'ta ve elle ("Run workflow") **Mobile build checks** iş akışı:

- `Saricicek-Android-demo` / `-live`: kurulabilir APK (hata ayıklama imzası).
- `Saricicek-Android-emulator-screens`: APK'nın Android 14 emülatöründe (Pixel 6) açıldığı ekran görüntüleri, arayüz
  ağacı ve günlük. İş, "Hayat" yazısı ekranda görünmezse başarısız olur.
- `Saricicek-iOS-Simulator-demo` / `-live`: iPhone simülatörüne kurulabilen `App.app` (zip).
- `Saricicek-iOS-simulator-screens`: simülatörde açılış ekran görüntüsü (kanıt; geçti/kaldı ölçütü değil).

Kendi bilgisayarında açmak için:

- **Android:** Android Studio → Device Manager'dan bir emülatör başlat → `adb install Saricicek-Android-demo.apk`
  (ya da APK'yı emülatör penceresine sürükle).
- **iOS (Mac + Xcode):** zip'i aç → `xcrun simctl boot "iPhone 15"` → `xcrun simctl install booted App.app` →
  `xcrun simctl launch booted com.saricicek.family`.

`demo` paketleri örnek aileyi içinde taşır ve canlı siteye hiç bağlanmaz. `live` paketleri canlı aile sitesini açar;
yalnız aile hesabıyla denenmeli.

## 3. Appetize (tarayıcıda simülatör bağlantısı)

Hazır: `scripts/appetize-upload.mjs` (test: `tests/appetize.test.mjs`) ve iş akışındaki `appetize` işi. Yalnız `demo`
paketleri yüklenir.

**Senden gereken son adım:** bir Appetize hesabı açıp API anahtarını GitHub deposuna **Settings → Secrets and
variables → Actions → New repository secret** ile `APPETIZE_API_TOKEN` adıyla eklemek. Plan ve ücret koşulları
Appetize'ın sitesindedir; bu iş için ücretli bir şey satın alınmadı. İlk yüklemeden sonra iş özeti iki bağlantı ve
"public key" yazar; bunları `APPETIZE_ANDROID_KEY` ve `APPETIZE_IOS_KEY` depo değişkeni olarak eklersen sonraki
yüklemeler aynı bağlantıyı günceller. Anahtar yokken iş "atlandı" notu bırakır ve başarısız olmaz.

## 4. Otomatik cihaz kontrolleri (tarayıcı)

`tests/e2e/devices.spec.mjs`: tüm ana sayfalar telefon (390×844), tablet (820×1180), masaüstü (1440×900) ve 320 px
genişlikte (≈%400 yakınlaştırma, WCAG 1.4.10), açık ve koyu temada:

- yana kayma yok;
- her denetim en az 24×24 px (WCAG 2.5.8); telefonda 44 px altındakiler rapora yazılır (çoğu 40–43 px; Kolay
  görünüm 48 px verir);
- koyu temada otomatik WCAG A/AA kuralları geçer;
- klavye odağı görünür.

Ayrıca: `phone.spec.mjs` (klavye açılınca alt menü), `navigation.spec.mjs` (geri hareketi), `a11y.spec.mjs` (açık tema
WCAG), `theme.spec.mjs` (tema seçimi). Bunlar Chromium öykünmesidir; çentik/güvenli alan, gerçek klavye, VoiceOver ve
TalkBack için `docs/PHONE-CHECKLIST.md` gerçek cihazda yapılmalıdır.
