# Tam yedek ve geri yükleme (Node / Docker kurulumu)

Uygulama içindeki "Otomatik yedekler" ekranı yalnız aile arşivini (kişiler, ilişkiler, fotoğraf bilgileri) korur. Hesapları ve konuşmaları içermez.

Bu belgedeki **tam yedek** ise veri klasörünün tamamını kapsar:
- bütün hesaplar (şifre özetleriyle);
- özel ve grup mesajları;
- ilişkiler ve ayarlar;
- bütün fotoğraf, ses ve belge dosyaları.

## Nasıl çalışır

- **Zamanlama.** Sunucu, `BACKUP_TARGET` tanımlıysa her gün UTC 02:00'den sonra bir kez tam yedek alır.
  - Yedek ayrı bir süreçte alınır; site yavaşlamaz.
  - Başarısız olursa bir saat sonra yeniden dener.
- **Dosya.** Yedek tek bir `.sfbk` dosyasıdır ve AES-256-GCM ile şifrelenir.
  - Anahtar `BACKUP_PASSPHRASE` parolasından türetilir.
  - Her dosyanın SHA-256 özeti yedeğin içindedir.
  - Parola olmadan dosya açılamaz. **Parolayı yedeklerden ayrı bir yerde saklayın.** Parola kaybolursa yedek de kaybolur.
- **Veritabanı.** Sunucu çalışırken tutarlı bir kopya olarak alınır (SQLite `VACUUM INTO`).
- **Hedef** (`BACKUP_TARGET`) iki türlü olabilir:
  - **Klasör** (`/backups` gibi): başka bir makineye bağlı bir disk ya da ağ klasörü. En yeni `BACKUP_KEEP` (varsayılan 14) yedek tutulur.
  - **S3 uyumlu depolama** (`s3://kova/klasör`): Amazon S3, Cloudflare R2, Backblaze B2, Wasabi gibi.
    - Yükleme sonrası dosya boyutu sunucudan doğrulanır.
    - Eski yedekleri silmek için kovada bir yaşam döngüsü (lifecycle) kuralı açın; örneğin 30 günden eski nesneler silinsin.
- **Hata bildirimi.** Başarısız bir yedek üç yerde görünür:
  - sunucu günlüğü (`"event":"backup.offsite_failed"`);
  - yönetici panelindeki hata listesi (`/api/experience/ops/errors`);
  - `BACKUP_ALERT_URL` tanımlıysa o adres: `{"text": "Sarıçiçek Konağı yedeği alınamadı: …"}` gövdesiyle POST edilir. ntfy.sh konusu, Slack/Discord gelen web kancası gibi adreslerle çalışır.
- **Durum.** Son başarılı ve başarısız denemeyi yöneticiler `GET /api/ops/backup-status` ile görür. Bilgi `DATA_DIR/backup-status.json` dosyasında tutulur.

## Kurulum (sizin yapmanız gereken)

`.env` dosyasına ekleyin:

```sh
BACKUP_TARGET=s3://aile-yedek/saricicek     # ya da bağlı bir klasör: /backups
BACKUP_PASSPHRASE=uzun-ve-ayri-saklanan-bir-parola
BACKUP_ALERT_URL=https://ntfy.sh/kendi-gizli-konu-adiniz   # isteğe bağlı

# Yalnız s3:// hedefi için:
BACKUP_S3_ENDPOINT=https://<hesap>.r2.cloudflarestorage.com   # AWS için boş bırakın
BACKUP_S3_REGION=auto                                         # AWS: bölge adı, ör. eu-central-1
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
```

- **Depolama hesabı ve anahtarlar sizden gelmeli.** Bu depoda gerçek bir hesap yok; hiçbir değer uydurulmadı. Anahtar yalnız o kovaya yazma ve okuma izni taşımalı.
- **Klasör hedefi.** Klasörü kapsayıcıya bağlamak için `compose.yaml`'da `app` servisine bir `volumes` satırı ekleyin, ör. `- /mnt/yedek-diski:/backups`.

Elle yedek almak için:

```sh
docker compose exec app node scripts/backup.mjs
```

## Geri yükleme (boş bir ortama)

```sh
# 1. Boş bir birime geri yükleyin. Kaynak bir dosya ya da doğrudan S3 adresi olabilir
#    (S3 için BACKUP_S3_* ayarları da verilir; yedek önce indirilir):
docker volume create aile_geri
docker run --rm -v aile_geri:/app/data -v "$PWD:/yedek" -e BACKUP_PASSPHRASE=... \
  <imaj> node scripts/restore.mjs /yedek/saricicek-....sfbk /app/data
docker run --rm -v aile_geri:/app/data --env-file .env \
  <imaj> node scripts/restore.mjs s3://aile-yedek/saricicek/saricicek-....sfbk /app/data
# 2. Uygulamayı bu birimle başlatın (compose.yaml'daki family_data yerine aile_geri).
```

Docker'sız kurulumda: `BACKUP_PASSPHRASE=... node scripts/restore.mjs yedek.sfbk ./yeni-veri` ve ardından `DATA_DIR=./yeni-veri npm start`.

Geri yükleme şu durumlarda hiçbir şey yazmadan durur; hedef klasör olduğu gibi kalır:
- hedef boş değilse;
- parola yanlışsa;
- dosya değiştirilmiş ya da eksikse.

Dosyalar önce hedefin içindeki geçici bir klasöre çıkarılır ve ancak hepsi doğrulandıktan sonra yerine taşınır.

## Denendi

- **Otomatik test (`tests/backup.test.mjs`, CI'da çalışır).** Gerçek Node sunucusunda şu veriler yedeklendi: iki hesap, bir özel mesaj, bir grup mesajı, iki kişi ve aralarındaki ilişki, bir fotoğraf.
  - Yedek boş bir klasöre geri yüklendi ve ikinci bir sunucu o klasörle başlatıldı.
  - Üye aynı şifreyle girdi; mesajlar, grup, ilişki ve fotoğraf baytı birebir aynı çıktı.
  - Bozuk dosya, yanlış parola ve dolu hedef reddedildi; geride yarım klasör kalmadı.
  - Başarısız yedek hata listesine yazıldı ve uyarı adresine gönderildi.
  - S3 imzası, AWS'nin resmî imzalayıcısıyla (`@smithy/signature-v4`) aynı sonucu veriyor.
- **Docker'da elle deneme (2026-09-27).**
  - Çalışan kapsayıcıda `node scripts/backup.mjs` ile yedek alındı (6 dosya, 0,4 MB).
  - Yedek, ayrı bir kapsayıcıda boş bir Docker birimine geri yüklendi.
  - Bu birimle başlatılan yeni kapsayıcı aynı kişileri ve aynı fotoğrafı sundu; SHA-256 özeti aynıydı.
- **S3 döngüsü (`tests/backup.test.mjs`).** Yerel bir S3 taklidine yedek yüklendi (PUT, ardından boyut kontrolü için
  HEAD), oradan indirilip boş klasöre geri yüklendi; fotoğraf baytı ve hesap aynı çıktı. Taklit her isteğin imzasını
  AWS'nin resmî imzalayıcısıyla yeniden hesaplayıp karşılaştırır; yanlış anahtar 403 aldı ve hiçbir şey yazılmadı.
- **Denenmedi (açık engel).** Gerçek bir S3/R2/B2 hesabına yükleme, indirme ve geri yükleme yapılmadı; depolama hesabı
  ve anahtarları gerekiyor. Anahtarlar `.env`'e girildikten sonra yapılacak tek deneme:
  `docker compose exec app node scripts/backup.mjs` → çıktıdaki `s3://…` adresiyle yukarıdaki geri yükleme komutu boş
  bir birime → o birimle uygulamayı başlatıp giriş yapmak.

## Cloudflare (Sites) sürümü

Veriler D1 ve R2'dedir. Tam yedek için Cloudflare'in kendi araçları kullanılmalıdır: D1 Time Travel ve dışa aktarma, R2 için ayrı bir kovaya kopyalama. Bu betikler yalnız Node kurulumu içindir.
