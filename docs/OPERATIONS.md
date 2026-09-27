# İşletim: ortam, migration, sürüm ve geri alma

Bu belge Node/Docker kurulumunu (önerilen üretim yolu) ve Cloudflare/Sites derlemesini birlikte anlatır.
Alan adı, sunucu ve e-posta kurulumu için [DEPLOYMENT.md](DEPLOYMENT.md), mobil yayın için [MOBILE-RELEASE.md](MOBILE-RELEASE.md).

## 1. Ortam değişkenleri (Node)

| Değişken | Zorunlu | Varsayılan | Açıklama |
| --- | --- | --- | --- |
| `SITE_DOMAIN` | Docker'da evet | — | Yalnız alan adı (`aile.ornek.com`). `compose.yaml` bundan `APP_ORIGIN` üretir. |
| `APP_ORIGIN` | Üretimde evet | `http://localhost:PORT` | Tam köken. CSRF/Origin denetimi ve davet bağlantıları bunu kullanır. |
| `PORT` / `HOST` | Hayır | `3000` / `0.0.0.0` | Dinlenen adres. |
| `DATA_DIR` | Hayır | `./data` | SQLite (`family.sqlite`) ve yüklenen dosyalar. **Yedeklenecek tek klasör budur.** |
| `TRUST_PROXY` | Docker'da `1` | — | Uygulama yalnız Caddy arkasındaysa `1`: giriş/davet/şifre sınırları ziyaretçi adresini `X-Forwarded-For` başlığının son değerinden alır. Uygulama doğrudan internete açıksa verilmez. |
| `SITE_OPERATOR_NAME`, `SUPPORT_EMAIL` | Yayından önce evet | — | Veri sorumlusunun adı ve destek adresi; gizlilik, destek ve hesap silme sayfalarında gösterilir. Boşsa sayfalar bu alanların eksik olduğunu açıkça yazar. |
| `SMTP_URL`, `MAIL_FROM` | Önerilir | — | Davet ve şifre yenileme e-postaları. Örnek: `smtps://kullanici:parola@smtp.saglayici.com:465` ve `Sarıçiçek Konağı <aile@alanadiniz.com>`. Boşsa e-posta gönderilmez; yönetici bağlantıyı elle paylaşır, "Şifremi unuttum" gösterilmez. Gönderilemeyen e-postalar 1 dk → 1 sa arası artan aralıklarla 5 kez denenir; kalıcı hatalar ve son deneme yönetici panelinde görünür. Cloudflare sürümünde e-posta gönderimi yoktur. |
| `FCM_SERVICE_ACCOUNT` | Android bildirimi için | — | Firebase hizmet hesabı JSON dosyasının tamamı (tek satır). Mesaj, etiketlenme ve yorum bildirimleri Android uygulamasına gider. Uygulama tarafında `android/app/google-services.json` de gerekir (aynı Firebase projesinden). |
| `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`, `APNS_ENV` | iPhone bildirimi için | — | Apple geliştirici hesabındaki .p8 anahtarı (PEM metni; satır sonları `\n` olabilir), anahtar kimliği, takım kimliği, paket kimliği (varsayılan `com.saricicek.family`), geliştirme derlemeleri için `APNS_ENV=sandbox`. Yalnız Node sürümünde; Cloudflare HTTP/2 ile Apple'a bağlanamaz. |
| `NODE_ENV` | Üretimde `production` | — | Güvenli çerez ve statik dosya önbelleği. |
| `BACKUP_TARGET`, `BACKUP_PASSPHRASE`, `BACKUP_ALERT_URL`, `BACKUP_KEEP`, `BACKUP_S3_*` | Önerilir | — | Tam şifreli yedek: [BACKUP.md](BACKUP.md). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Yalnız ilk kurulumda | — | `npm run admin` ilk yöneticiyi oluşturur; sonra parolayı ortamdan kaldırın. |
| `SECURITY_KEY` | Hayır | Otomatik üretilir | İki adımlı doğrulama sırlarını şifreler. Verilmezse veri tabanında saklanır; hiçbir API yanıtına girmez (test: `tests/api.test.mjs`). Değiştirilirse kayıtlı iki adımlı doğrulamalar çözülemez. |
| `MEDIA_JOBS` | Hayır | açık | `off` sunucudaki fotoğraf kopyası işini kapatır (kopyaları tarayıcı yapar). Yalnız test için. |
| `OPENAI_API_KEY`, `IMAGE_MODEL` | Hayır | — | İsteğe bağlı fotoğraf onarımı; anahtar yoksa özellik kapalıdır. Ücretli hizmettir, varsayılan kurulumda gerekmez. |
| `DEMO_MODE` | Hayır | — | `1` gerçek veri olmadan örnek aileyi gösterir (`npm run demo`). |

Cloudflare/Sites derlemesinde kimlik `oai-authenticated-user-*` başlıklarından gelir; veri D1, dosyalar R2'dedir. Ortam: `OWNER_EMAIL`, `CSRF_SECRET` ve `DB`/`BUCKET` bağları.

## 2. Veri tabanı değişiklikleri (migration)

- Şema: `db/schema.ts`. Değişiklikten sonra `npm run db:generate`, `drizzle/NNNN_ad.sql` dosyasını üretir.
- Node, açılışta `drizzle/` içindeki dosyaları sırayla ve her birini **bir kez**, bir işlem (transaction) içinde uygular (`local_migrations` tablosu). Uygulanmış bir dosyayı sonradan değiştirmeyin; düzeltme için yeni dosya ekleyin.
- Cloudflare derlemesi (`npm run build`) aynı dosyaları `dist/.openai/drizzle` altına koyar; barındırma bunları D1'e uygular.
- Testler her migration'ı boş bir veri tabanına uygular (`tests/support/worker-fixture.mjs`); bozuk bir dosya `npm test`'i düşürür.
- Kural: migration'lar **yalnız ekleme** yapar (yeni tablo, varsayılanı olan yeni sütun, dizin). `DROP`/`RENAME` gerekiyorsa iki sürüme bölün: önce kodu eski yapıya bağımlı olmaktan çıkarın, sonraki sürümde kaldırın. Böylece bir önceki uygulama sürümü yeni şemayla çalışmaya devam eder ve geri alma yalnız uygulamayı geri almakla yapılabilir. `drizzle/` altında şu an `DROP`/`RENAME` yoktur.

## 3. Sürüm adımları

1. Dalda yerel denetimler: `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run test:e2e`. CI aynılarını çalıştırır (`.github/workflows/ci.yml`).
2. Yeni migration varsa üretim verisinin bir kopyasında deneyin: `DATA_DIR` olarak kopyayı verip `npm start`; açılış hatasız olmalı.
3. Sunucuda **önce tam yedek** alın ([BACKUP.md](BACKUP.md)); yönetim ekranındaki arşiv yedeği hesapları ve sohbetleri içermez:
   ```sh
   docker compose exec app node scripts/backup.mjs
   ```
4. Güncelle: `git pull && docker compose build app && docker compose up -d app`.
5. Doğrula: `curl -fsS https://ALAN_ADI/health`, giriş, Hayat akışı, bir fotoğraf yükleme; yönetim panelinde hata kaydı (`/api/experience/ops/errors`) boş ya da açıklanabilir olmalı. Günlükler JSON satırlarıdır: `docker compose logs app | grep '"level":"error"'`.
6. Yayınlanan sürümün commit'ini not edin (`git rev-parse --short HEAD`).

## 4. Geri alma

- **Yalnız kod sorunu** (en sık durum): önceki commit'e dönüp yeniden kurun. Migration'lar yalnız ekleme yaptığı için eski kod yeni şemayla çalışır.
  ```sh
  git checkout ÖNCEKİ_COMMIT && docker compose build app && docker compose up -d app
  ```
- **Veri bozulduysa**: 3. adımdaki yedeği boş bir birime geri yükleyip önceki sürümü o birimle başlatın ([BACKUP.md](BACKUP.md) → Geri yükleme). Bozulan birimi, sorun anlaşılana kadar silmeyin. Yedekten sonra girilen veriler kaybolur; bu yüzden güncellemeyi az kullanılan bir saatte yapın.
- Yedek ve geri yükleme komutları 2026-09-27'de Docker'da boş bir birime geri yüklenerek denendi (BACKUP.md → Denendi).

## 5. Capacitor 7 → 8 değerlendirmesi

Durum: **yükseltilmedi; ayrı iş olarak bekliyor.** Kurulu 7.6.9, güncel 8.5.2 (npm, 2026-09-27).

- Yerel projeler zaten Capacitor 8'in beklediği düzeyde: Android `minSdk 24`, `compileSdk/targetSdk 36`, AGP 8.13.0, Gradle 8.14.3; iOS dağıtım hedefi 15.0 (8.5.2 paketlerinin kendi `build.gradle`/podspec değerleriyle karşılaştırıldı). Yükseltme büyük ölçüde paket sürümleri ve `npx cap migrate` işidir.
- Bilinmeyenler: `@capacitor-community/background-geolocation` 1.2.26 yalnız `@capacitor/core >=3` ister; Capacitor 8 ile derlenip çalıştığı doğrulanmadı. Kotlin 2.2.20'ye geçiş eklentiyi etkileyebilir.
- Bu ortamda Android SDK ve Xcode yok; yükseltme burada derlenip doğrulanamaz. Doğrulanmamış bir yükseltmeyi göndermek yerine sıra şöyle: önce CI'da Android ve iOS Simulator derlemeleri kurulur, sonra yükseltme ayrı bir commit'te o derlemelerle ve fiziksel cihaz listesiyle ([PHONE-CHECKLIST.md](PHONE-CHECKLIST.md)) doğrulanır.
- Yerel bildirim (push) eklentisi eklenecekse ana sürüm çekirdekle aynı olmalıdır (7 ile `@capacitor/push-notifications@7`).
