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
4. [ ] Hız: ikon alt kümesi, harita tembel yükleme, JS küçültme; UI tutarsızlıkları
5. [ ] Güvenlik, sunucu dışı yedek, veri dışa aktarma, gizlilik/destek sayfaları, güncelleme/geri dönüş belgesi
6. [ ] Native bildirim, e-posta, GEDCOM, video, sesli yorum, çevrimdışı okuma, yönetici paneli
7. [ ] Test ortamları: web demo bağlantısı, cihaz ölçüsü seçimi, Android/iOS derlemeleri, Appetize
8. [ ] CI doğrulama, kapasite testi, kılavuz, tek dosya demo, teslim

Sıradaki iş: 4 (hız ölçümü önce/sonra, ikon alt kümesi, harita tembel yükleme, JS küçültme, UI tutarsızlıkları)
