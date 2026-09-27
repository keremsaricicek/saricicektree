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
   - [k] Üst üste sarma zincirleri: aynı dosyadaki çok katmanlılar birleştirildi (knAction, archiveHandle, render/handle/ffHandle/ffApi/readRoute).
     Dosyalar arası ~45 tek katmanlı sarma duruyor (ui/*.js yeniden tasarım katmanları); kaldırmak temel fonksiyonları
     yeniden yazmayı gerektirir, bu turda davranış riski nedeniyle yapılmadı. Denetim aracı: scripts/visual-snapshot.mjs.
4. [x] Hız: ikon alt kümesi, harita tembel yükleme, JS küçültme; UI tutarsızlıkları — docs/PERFORMANCE.md
   - Aynı koşullarda ölçüldü (scripts/measure-load.mjs, CPU 4×, 10 Mbit/s, soğuk önbellek, 5 ölçümün ortancası):
     Hayat hazır 2703 → 1488 ms; JS 1738/514 KB → 408/143 KB (ham/gzip); toplam 2286/896 → 956/524 KB.
   - İkonlar 397 → 37 KB; harita yalnız harita ekranlarında; betikler küçültülmüş (public/min/).
     44 demo ekranı değişiklik öncesiyle bayt bayt aynı.
   - Yeniden çizim (1.200 kişi): kişi aramasında her tuşta sayfa kurulumu kaldırıldı (7 → 1); ağaç ziyaretinde çift çizim kaldırıldı.
     Canlı güncellemede sayfa yeniden kurulmuyor, taslak ve kaydırma korunuyor (testli).
   - Erişilebilirlik: axe-core WCAG 2.1 A/AA testi tüm sayfalar ve ana pencereler için (telefon + masaüstü) CI'da; bulunan tek hata düzeltildi.
   - Kalan: 1.200 kişilik ağaç tek seferde çiziliyor (757 ms, CPU 4×); dünya haritası 755 KB (daha kaba harita tasarım kararı ister).
5. [x] Güvenlik, sunucu dışı yedek, veri dışa aktarma, gizlilik/destek sayfaları, güncelleme/geri dönüş belgesi
   - Denetim ve bulunan açıklar: docs/SECURITY-REVIEW.md (giriş sınırının bütün aileye ortak olması; hesap silmede kalan veriler).
   - Tam şifreli yedek (hesaplar, özel/grup mesajlar, ilişkiler, medya): günlük zamanlama, başarısızlıkta kayıt + uyarı adresi,
     boş ortama geri yükleme testi (CI) ve Docker'da elle deneme. docs/BACKUP.md.
   - [!] Gerçek S3/R2/B2 hesabına yükleme denenmedi (hesap ve anahtar gerekir); imza resmî AWS imzalayıcısıyla doğrulandı.
   - Verilerimi indir (başkalarının verisi olmadan); hesap silme artık iz bırakmıyor (testli).
   - Gizlilik, destek, hesap silme sayfaları. [!] İşletmeci adı ve destek e-postası sizden gelmeli.
   - Güncelleme/geri alma: docs/OPERATIONS.md.
   - [!] Tam Docker imajı yeniden derlenemedi (Docker Hub 429); değişen tek satır (scripts kopyası) önceki imaj üzerinde denendi.
6. [ ] Native bildirim, e-posta, GEDCOM, video, sesli yorum, çevrimdışı okuma, yönetici paneli
7. [ ] Test ortamları: web demo bağlantısı, cihaz ölçüsü seçimi, Android/iOS derlemeleri, Appetize
8. [ ] CI doğrulama, kapasite testi, kılavuz, tek dosya demo, teslim

Sıradaki iş: 6 (native bildirim, e-posta, GEDCOM, video, sesli yorum, çevrimdışı okuma, yönetici paneli)
