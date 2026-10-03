# Durum listesi (bakım ve eksikler turu)

Durum: [x] kodlandı ve test edildi · [k] kodlandı, test edilmedi/kısmi · [ ] bekliyor · [!] dış engel (hesap/cihaz/ücret)
"Yayınlandı" hiçbir madde için geçerli değildir: main'e birleştirme, canlı yayın veya mağaza başvurusu yapılmadı.

1. [x] Skill/agent kurulumu — `.claude/SOURCES.md`
2. [x] Tarayıcı testlerini depoya/CI'a taşı; bilinen hataları doğrula/düzelt
   - Tarayıcı testleri: tests/e2e (Playwright), CI'da "browser" işi; 21 test, iki test sunucusu (sunucu/tarayıcı kopyası)
   - Doğrulanan ve düzeltilen: sessiz kopya hataları, kısmi kopyaların atlanması, görsel yapı/ölçü denetimi,
     silme/geri almanın diğer akışlara yansımaması, pencere kapatma–geri hareketi yarışı (+ native Android geri),
     canlı sayacın özel faaliyeti yansıtması. Her biri önce başarısız olan bir testle yeniden üretildi.
   - Docker imajı bu ortamda derlendi ve çalıştı (/health, sharp yüklü); vekil sertifikası yalnızca geçici Dockerfile'da
3. [x] Biçimlendirme, linter, tip denetimi, modüllere ayırma, ölü kod (bir alt madde kısmi)
   - Prettier + ESLint (0 uyarı) + TypeScript checkJs (sunucu, Worker, ortak modüller); CI'da çalışır.
     Biçim değişiklikleri davranış değişikliklerinden ayrı commit'lerde.
   - ui.js 10 dosyaya bölündü (public/ui/); güvenli şablon yardımcısı (html`` / raw()).
   - Node ve Cloudflare aynı çekirdek API'yi kullanır (src/core-api.mjs); ~650 yinelenen satır silindi.
     Güvenlik anahtarının ayarlarla dışarı sızmaması testle korunuyor.
   - Hata yönetimi: boş catch kalmadı; sunucu hataları JSON log + error_log (istek gövdesi olmadan), tarayıcı hataları raporlanır.
   - Ortam/migration/sürüm/geri alma ve Capacitor 8 değerlendirmesi: docs/OPERATIONS.md (Docker yedek komutları henüz denenmedi → 5).
   - [x] Dosyalar arası sarmalayıcılar: tamamen ezilen 12 katman silindi (60 → 47); kalanların gerekçesi docs/CLIENT-LAYERS.md (bkz. 7).
4. [x] Hız: ikon alt kümesi, harita tembel yükleme, JS küçültme; UI tutarsızlıkları — docs/PERFORMANCE.md
   - Aynı koşullarda ölçüldü (scripts/measure-load.mjs, CPU 4×, 10 Mbit/s, soğuk önbellek, 5 ölçümün ortancası):
     Hayat hazır 2703 → 1488 ms; JS 1738/514 KB → 408/143 KB (ham/gzip); toplam 2286/896 → 956/524 KB.
   - İkonlar 397 → 37 KB; harita yalnız harita ekranlarında; betikler küçültülmüş (public/min/).
     44 demo ekranı değişiklik öncesiyle bayt bayt aynı.
   - Yeniden çizim (1.200 kişi): kişi aramasında her tuşta sayfa kurulumu kaldırıldı (7 → 1); ağaç ziyaretinde çift çizim kaldırıldı.
     Canlı güncellemede sayfa yeniden kurulmuyor, taslak ve kaydırma korunuyor (testli).
   - Erişilebilirlik: axe-core WCAG 2.1 A/AA testi tüm sayfalar ve ana pencereler için (telefon + masaüstü) CI'da; bulunan tek hata düzeltildi.
   - Büyük ağaç ve dünya haritası sonradan iyileştirildi (bkz. 7).
5. [x] Güvenlik, sunucu dışı yedek, veri dışa aktarma, gizlilik/destek sayfaları, güncelleme/geri dönüş belgesi
   - Denetim ve bulunan açıklar: docs/SECURITY-REVIEW.md (giriş sınırının bütün aileye ortak olması; hesap silmede kalan veriler).
   - Tam şifreli yedek (hesaplar, özel/grup mesajlar, ilişkiler, medya): günlük zamanlama, başarısızlıkta kayıt + uyarı adresi,
     boş ortama geri yükleme testi (CI) ve Docker'da elle deneme. docs/BACKUP.md.
   - [!] Gerçek S3/R2/B2 hesabına yükleme denenmedi (hesap ve anahtar gerekir); imza resmî AWS imzalayıcısıyla doğrulandı.
   - Verilerimi indir (başkalarının verisi olmadan); hesap silme artık iz bırakmıyor (testli).
   - Gizlilik, destek, hesap silme sayfaları. [!] İşletmeci adı ve destek e-postası sizden gelmeli.
   - Güncelleme/geri alma: docs/OPERATIONS.md.
   - [x] Docker imajı CI'da sıfırdan (`--no-cache --pull`) derlenip compose ile Caddy + HTTPS arkasında çalıştırıldı:
     sağlık, uygulama sayfası, giriş, veri ve ffmpeg denetlendi. Bu geliştirme ortamında Debian paket sunucusu engelli olduğu
     için imaj burada derlenemiyor.
   - [x] Gerçek Caddy (2.10.2) ve depodaki Caddyfile ile: sahte X-Forwarded-For giriş sınırını aşamıyor, iki ziyaretçi ayrı
     sayılıyor, 12 MB gövde sınırı (tests/caddy.test.mjs, CI'da Caddy indirilip çalışır).
6. [x] Yeni özellikler (her biri birim/API ve tarayıcı testli)
   - Yönetici kullanım paneli (sayılar, depolama, yedek, hatalar; mesaj içeriği yok).
   - E-posta: davet ve "Şifremi unuttum", tek kullanımlık ve süreli bağlantılar, kuyruk + yeniden deneme (yerel SMTP ile test).
     [!] Gerçek SMTP hesabıyla teslim denenmedi.
   - Native bildirim (FCM/APNs): mesaj, etiket, yorum; tercihler, cihaz kaydı silme, dokununca ilgili yere gitme.
     [!] Gerçek Firebase/Apple hesabıyla teslim denenmedi (yerel taklitlerle test).
   - GEDCOM içe/dışa aktarma: önizleme, doğrulama, eşleşme, desteklenmeyen bilgi kaybolmadan biyografiye.
   - Video (Hayat + Avlu): parça parça devam eden yükleme, bayttan tür/süre/boyut denetimi, ffmpeg oynatma kopyası + kapak,
     Range ile oynatma, erişim fotoğrafla aynı.
   - Sesli yorum (Hayat). Çevrimdışı okuma (isteğe bağlı, çıkışta silinir, çevrimdışı göstergesi).
7. [x] Kod sağlığı ve hız
   - Dosyalar arası sarmalayıcı 60 → 47; tamamen ezilen 12 ölü katman silindi (426 satır), 22 demo ekranı piksel düzeyinde aynı.
     Kalanların gerekçesi: docs/CLIENT-LAYERS.md.
   - Büyük ağaç: yalnız görünen kartlar (1.200 kişi: açılış 371 → 89 ms, DOM 8.408 → 232). Dünya haritası hafif başlar,
     yakınlaşınca tam ayrıntı (harita hazır 2.521 → 1.968 ms, yığın 40 → 20,5 MB). docs/PERFORMANCE.md.
8. [x] Test ortamları ve cihaz kontrolleri — docs/TEST-ENVIRONMENTS.md
   - Tek bağlantılı web önizlemesi (örnek veri, telefon/tablet/masaüstü, sürüm bilgisi).
   - Android emülatörü ve iOS simülatörü CI'da; demo APK ve iOS simülatör paketi indirilebilir.
   - [!] Appetize: iş akışı ve betik hazır, hesap ve APPETIZE_API_TOKEN gerekiyor.
   - Otomatik cihaz kontrolleri (telefon/tablet/masaüstü/320 px, açık/koyu): bulunan 4 sorun düzeltildi.
   - [!] Gerçek cihaz, VoiceOver ve TalkBack denenmedi.
9. [x] Kapasite — docs/CAPACITY.md
   - Kademeli test (100/250/500/1.000 eşzamanlı etkin kullanıcı, gerçekçi karışım): 250'de tıkanma bulundu ve giderildi.
     Son durum: 500 kullanıcıda hata yok, p95 60 ms; 1.000'de %1,84 zaman aşımı, p95 1,0 s (tek süreç, 4 çekirdek sınırı).
10. [!] Yayın kararları ve hesaplar — docs/RELEASE-DECISIONS.md
   - Kalıcı silme süresi kararı, işletmeci adı, destek adresi, alan adı, SMTP, depolama, mağaza hesapları ve imzalama.
   - Yedek: S3 yükle/indir/boş geri yükle yerel taklitte test edildi; gerçek hesapla denenmedi.

Main'e birleştirme, canlı yayın ve mağaza başvurusu yapılmadı.
