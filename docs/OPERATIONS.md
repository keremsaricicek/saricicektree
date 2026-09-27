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
| `NODE_ENV` | Üretimde `production` | — | Güvenli çerez ve statik dosya önbelleği. |
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
3. Sunucuda **önce yedek**: yönetim ekranındaki arşiv yedeği yeterli değildir (hesapları ve sohbetleri içermez). `family_data` volume'unu kopyalayın:
   ```sh
   docker compose stop app
   docker run --rm -v saricicektree_family_data:/data -v "$PWD/yedek:/yedek" alpine tar czf /yedek/data-$(date +%F-%H%M).tgz -C /data .
   ```
4. Güncelle: `git pull && docker compose build app && docker compose up -d app`.
5. Doğrula: `curl -fsS https://ALAN_ADI/health`, giriş, Hayat akışı, bir fotoğraf yükleme; yönetim panelinde hata kaydı (`/api/experience/ops/errors`) boş ya da açıklanabilir olmalı. Günlükler JSON satırlarıdır: `docker compose logs app | grep '"level":"error"'`.
6. Yayınlanan sürümün commit'ini not edin (`git rev-parse --short HEAD`).

## 4. Geri alma

- **Yalnız kod sorunu** (en sık durum): önceki commit'e dönüp yeniden kurun. Migration'lar yalnız ekleme yaptığı için eski kod yeni şemayla çalışır.
  ```sh
  git checkout ÖNCEKİ_COMMIT && docker compose build app && docker compose up -d app
  ```
- **Veri bozulduysa**: uygulamayı durdurun, 3. adımdaki arşivi geri açın, önceki sürümü başlatın. Yedekten sonra girilen veriler kaybolur; bu yüzden güncellemeyi az kullanılan bir saatte yapın.
  ```sh
  docker compose stop app
  docker run --rm -v saricicektree_family_data:/data -v "$PWD/yedek:/yedek" alpine sh -c "rm -rf /data/* && tar xzf /yedek/DOSYA.tgz -C /data"
  git checkout ÖNCEKİ_COMMIT && docker compose build app && docker compose up -d app
  ```
- Volume adı proje klasörüne göre değişir; `docker volume ls` ile doğrulayın.
- Not: 3. ve 4. adımdaki `docker` yedek/geri yükleme komutları henüz boş bir ortamda denenmedi; deneme sonucu buraya yazılacak.

## 5. Capacitor 7 → 8 değerlendirmesi

Durum: **yükseltilmedi; ayrı iş olarak bekliyor.** Kurulu 7.6.9, güncel 8.5.2 (npm, 2026-09-27).

- Yerel projeler zaten Capacitor 8'in beklediği düzeyde: Android `minSdk 24`, `compileSdk/targetSdk 36`, AGP 8.13.0, Gradle 8.14.3; iOS dağıtım hedefi 15.0 (8.5.2 paketlerinin kendi `build.gradle`/podspec değerleriyle karşılaştırıldı). Yükseltme büyük ölçüde paket sürümleri ve `npx cap migrate` işidir.
- Bilinmeyenler: `@capacitor-community/background-geolocation` 1.2.26 yalnız `@capacitor/core >=3` ister; Capacitor 8 ile derlenip çalıştığı doğrulanmadı. Kotlin 2.2.20'ye geçiş eklentiyi etkileyebilir.
- Bu ortamda Android SDK ve Xcode yok; yükseltme burada derlenip doğrulanamaz. Doğrulanmamış bir yükseltmeyi göndermek yerine sıra şöyle: önce CI'da Android ve iOS Simulator derlemeleri kurulur, sonra yükseltme ayrı bir commit'te o derlemelerle ve fiziksel cihaz listesiyle ([PHONE-CHECKLIST.md](PHONE-CHECKLIST.md)) doğrulanır.
- Yerel bildirim (push) eklentisi eklenecekse ana sürüm çekirdekle aynı olmalıdır (7 ile `@capacitor/push-notifications@7`).
