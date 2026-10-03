# Kapasite testi: 1.000 eşzamanlı kullanıcıya kadar kademeli yük

Ölçüm: `node scripts/capacity.mjs 60 docs/CAPACITY-RESULTS.json` (ham veriler JSON'da). Yalnız yerel, geçici test
verisiyle çalışır; canlı siteye ya da gerçek aile verisine dokunmaz.

## Koşullar

- **Altyapı:** tek Node süreci + SQLite (Docker kurulumundaki gibi), 4 sanal çekirdek, 15 GB bellek. Node tek bir
  iş parçacığında çalışır; yani sunucu bu dört çekirdeğin birini kullanabilir.
- **Yük üretici aynı makinede** çalışır ve çekirdekleri sunucuyla paylaşır. Ayrı bir makineden ölçüm daha iyi
  sonuç verir; burada yapılamadı.
- **Veri:** 1.000 üye (her biri ayrı oturum), 1.000 kişi, 3.000 paylaşım ve etkinlik geçmişi, 20.000 mesaj.
- **Kullanıcı davranışı:** her sanal kullanıcı sayfası açık bir üyedir. Bir canlı bağlantı (SSE) tutar; sunucu bunu
  25 saniyede bir kapatır, sayfa yeniden açar. İki işlem arasında 1–3 saniye okur.
- **İşlem karışımı:** Hayat ilk sayfa %30, yeni etkinlik kontrolü %15, yorumları açma %10, yorum yazma %7, beğeni %7,
  sohbet açma %12, mesaj gönderme %10, ağaç/temel veri %6, fotoğraf yükleme (150 KB JPEG) %3.
- **Aşamalar:** 100 → 250 → 500 → 1.000 eşzamanlı kullanıcı. Her aşama 5 saniye oturur, sonra 60 saniye ölçülür.
  İstemci 30 saniyede yanıt alamazsa istek hata sayılır.

Bu, aynı anda **etkin** 1.000 kullanıcıdır; kayıtlı üye sayısı değildir. 1.000 kişilik bir ailede herkesin aynı anda
1–3 saniyede bir işlem yapması gerçek kullanımdan çok daha yoğundur.

## Sonuç (son sürüm)

| Eşzamanlı kullanıcı | İstek | İstek/sn | Hata | p50 | p95 | p99 | Sunucu belleği |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 2.990 | 50 | %0 | 4 ms | 12 ms | 17 ms | 146 MB |
| 250 | 7.473 | 125 | %0 | 4 ms | 23 ms | 39 ms | 150 MB |
| 500 | 14.885 | 248 | %0 | 9 ms | 60 ms | 108 ms | 195 MB |
| 1.000 | 19.293 | 322 | %1,84 | 236 ms | 1.034 ms | 30 s (zaman aşımı) | 238 MB |

- Canlı bağlantı açma: 4.950 isteğin hepsi kabul edildi (200).
- Test sonunda SQLite bütünlük denetimi "ok", yabancı anahtar hatası 0.

**Değerlendirme:** Bu makinede tek sunucu süreci 500 eşzamanlı etkin kullanıcıyı hatasız ve hızlı (p95 60 ms)
taşır. 1.000'de istenen yük yaklaşık 500 istek/sn'dir, sunucu ise ~320–380 istek/sn yanıtlayabilir: kuyruk birikir,
p95 1 saniyeyi geçer ve isteklerin %1,8'i 30 saniyede yanıt alamaz. Yani **1.000 eşzamanlı etkin kullanıcı bu tek
süreçli kurulumun sınırının üstündedir.** Darboğaz sunucunun tek iş parçacığıdır; bağımsız bir `/health` yoklaması da
aynı gecikmeyi gördü (bağlantı hemen kuruluyor, yanıt kuyrukta bekliyor).

## Önce / sonra (aynı betik, aynı makine)

Bu test ilk çalıştırıldığında sistem 250 kullanıcıda tıkandı. Profil (`node --cpu-prof`) sunucu süresinin %55'inin
canlı bağlantı denetiminde geçtiğini gösterdi. Üç düzeltme yapıldı:

1. **Akış imleci sorgusu** (`feedCursorSQL`) görünürlük kurallarını etkinlik geçmişinin *tamamı* için çalıştırıyordu;
   maliyeti geçmişle büyüyordu. Artık en yeniden geriye bakıp ilk görünen kayıtta duruyor (aynı sonuç).
2. **Derlenmiş sorgular yeniden kullanılıyor** (`src/db.mjs`, en fazla 500, eskisi önce çıkar). Büyük sorguda derleme,
   çalıştırmanın ~12 katıydı (0,18 ms'ye karşı 0,015 ms).
3. **Akış değişikliği uyandırmaları birleştiriliyor** (`src/realtime.mjs`): her beğeni ve yorum, açık tüm sayfaların
   denetimini anında yeniden çalıştırıyordu. Artık 300 ms içindeki değişiklikler tek turda bildiriliyor. Özel mesaj
   bildirimleri hedefli ve anlık kaldı.

Ayrıca yüklemelerin base64 çözümü bayt başına işlev çağrısından doğrudan çözümlemeye geçti. Davranış aynı; boyutu
aşan dosya artık çözülmeden reddediliyor.

| Eşzamanlı kullanıcı | Önce: p95 / hata / istek/sn | Sonra: p95 / hata / istek/sn |
| --- | --- | --- |
| 100 | 109 ms / %0 / 50 | 12 ms / %0 / 50 |
| 250 | 18,9 s / %0 / 56 | 23 ms / %0 / 125 |
| 500 | 30 s / %23,9 / 60 | 60 ms / %0 / 248 |
| 1.000 | 10,5 s / %34 / 125 | 1,0 s / %1,84 / 322 |

Denenen ama yarar görülmeyip geri alınanlar:

- Bağlantı kuyruğunu 4.096'ya çıkarmak: bekleme bağlantıda değil, yanıt kuyruğundaydı.
- Canlı bağlantıda oturum denetimini 5 saniyede bire indirmek: kazancı ölçülemedi, erişimi kaldırılan kişinin
  bağlantısının hemen kapanmasını geciktiriyordu (bunu bir test korur).

Repodaki Caddyfile ile Caddy önde de denendi. Caddy, sunucu ve yük üretici aynı dört çekirdeği paylaşınca sonuç
daha kötüydü (1.000'de p95 8,5 s). Üretimde Caddy'nin payı ayrı makinede ölçülmelidir.

## 1.000 eşzamanlı etkin kullanıcı gerekiyorsa

Ölçülmedi, öneridir:

- daha hızlı tek çekirdekli bir sunucu;
- okumaları birden çok Node sürecine dağıtmak (SQLite WAL okumaya izin verir; canlı bağlantıların 5 saniyelik
  veritabanı denetimi zaten süreçler arası çalışacak biçimde yazıldı);
- ya da Cloudflare sürümü (D1/R2), ayrı yük testi gerektirir.

## Kapsam dışı

Gerçek ağ gecikmesi, CDN, gerçek telefonlar, video dönüştürme yükü (`VIDEOS=off`), anlık bildirim servisleri ve
Cloudflare sürümü bu testte yoktur. Önceki iki dalgalı test: `STRESS-RESULTS.md`.
