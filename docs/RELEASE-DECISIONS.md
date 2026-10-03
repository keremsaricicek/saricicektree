# Yayından önce senden gerekenler

Bu listedeki hiçbir bilgi uydurulmadı. Hepsi boş bırakıldı ve boş olduğu yerde sayfalar ya da iş akışları bunu açıkça
söylüyor. Yazılım tarafı hazır olanlar "hazır" diye, senin kararını ya da hesabını bekleyenler "gerekiyor" diye
işaretli.

## 1. Kalıcı silme süresi (karar gerekiyor)

**Bugün ne oluyor:** Kaldırılan paylaşım, yorum, fotoğraf, video, kişi ve arşiv kaydı hemen görünmez olur ama
veritabanında "silinmiş" işaretiyle kalır (yönetici geri getirebilsin diye). Dosyaları (özgün fotoğraf, küçük
kopyalar, video ve oynatma kopyası, kapak, sesli yorum) diskte kalır. Kişi kalıcı silinmesini e-postayla ister.
Şifreli tam yedekler `BACKUP_KEEP` (varsayılan 14) gün tutulur; S3'te süre kovanın yaşam döngüsü kuralıdır.

**Senden gereken karar:** "Silinmiş" işaretli içerik kaç gün sonra kendiliğinden kalıcı silinsin? (Örnek seçenekler:
30, 90 gün ya da hiç; süre hukuki/aile kararıdır, ben seçmedim.)

**Karar verilince uygulanacak olan** (kod henüz yazılmadı; süre belli olmadan yazılması süreyi seçmek olurdu):

- **İçerik:** süresi dolan "silinmiş" satırlar ve onlara bağlı etiket, tepki, yorum, bildirim kayıtları silinir.
- **Medya türevleri:** özgün dosya ile birlikte küçük kopyalar (`photo_variants`), video oynatma kopyası ve kapak,
  sesli yorum dosyası diskten silinir.
- **Yedekler:** silinen bilgi, en eski yedeğin süresi dolana kadar (klasörde `BACKUP_KEEP` gün, S3'te yaşam döngüsü)
  yedeklerde kalır. Gizlilik ve hesap silme sayfaları bunu zaten söylüyor; süre seçilince bu iki sayfaya "X gün sonra
  kalıcı silinir" cümlesi eklenecek.

## 2. İşletmeci bilgileri (bilgi gerekiyor)

| Ayar | Nerede görünür | Durum |
| --- | --- | --- |
| `SITE_OPERATOR_NAME` | Gizlilik, destek, hesap silme sayfaları (veri sorumlusu) | Boş; sayfalar eksik olduğunu yazıyor |
| `SUPPORT_EMAIL` | Aynı sayfalar, kalıcı silme talepleri | Boş |
| `SITE_DOMAIN` | Caddy (HTTPS sertifikası), davet ve şifre bağlantıları | Boş; Docker kurulumu bunsuz başlamaz |
| `SMTP_URL`, `MAIL_FROM` | Davet ve "Şifremi unuttum" e-postaları | Boş; e-posta kapalı, bağlantılar elle paylaşılır |
| `BACKUP_*` | Günlük şifreli tam yedek | Boş; yedek kapalı (docs/BACKUP.md) |

Hepsi `.env` dosyasına girilir; açıklamalar `docs/OPERATIONS.md`'de.

## 3. Mağaza hesapları ve imzalama (hesap gerekiyor)

**Android (Google Play):**

- Hazır: `android/app/build.gradle` sürüm imzasını ortamdan okur; "Mobile build checks" iş akışında elle çalıştırılan
  `android-release` işi Play için AAB üretir. Anahtar yoksa AAB imzasız çıkar (yüklenemez, yalnız derlemenin
  çalıştığını gösterir).
- Gerekiyor: Google Play Console hesabı; bir yükleme anahtarı (`keytool -genkeypair -v -keystore upload.jks -keyalg
  RSA -keysize 2048 -validity 10000 -alias upload`); GitHub deposuna şu gizli anahtarlar: `ANDROID_KEYSTORE_BASE64`
  (`base64 -w0 upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Anahtar
  dosyasını repoya koyma; kaybolursa Play'den sıfırlama istenir.
- Bildirim için: Firebase projesi, `android/app/google-services.json` ve sunucuda `FCM_SERVICE_ACCOUNT`.

**iOS (App Store):**

- Hazır: simülatör derlemesi ve push yetkisi (`App.entitlements`, geliştirme ortamı).
- Gerekiyor: Apple Developer Program üyeliği, takım kimliği, `com.saricicek.family` paket kimliğinin kaydı, dağıtım
  sertifikası ve sağlama profili, App Store Connect kaydı. İmzalı arşiv (`xcodebuild archive`) bunlar olmadan
  üretilemez. Bildirim için `.p8` APNs anahtarı ve sunucuda `APNS_*` ayarları; mağaza sürümünde
  `aps-environment` değeri `production` olmalı.

**Her iki mağaza:** gizlilik ve destek adresi (yukarıdaki `SITE_OPERATOR_NAME` / `SUPPORT_EMAIL` dolunca sayfalar
hazır), inceleme için örnek veri içeren deneme hesabı, gerçek cihaz ekran görüntüleri. Ayrıntılar:
`docs/MOBILE-RELEASE.md`, `docs/STORE-LISTING-TR.md`.

## 4. Kendiliğinden yapılmayanlar

- `main` dalına birleştirme, canlı yayın, mağazaya yükleme yapılmadı; senin onayını bekler.
- Uçtan uca şifreleme eklenmedi (kapsam dışı).
- Ücretli hiçbir hizmet satın alınmadı.
