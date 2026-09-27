# Durum listesi (bakım ve eksikler turu)

Durum: [x] kodlandı ve test edildi · [k] kodlandı, test edilmedi/kısmi · [ ] bekliyor · [!] dış engel (hesap/cihaz/ücret)
"Yayınlandı" hiçbir madde için geçerli değildir: main'e birleştirme, canlı yayın veya mağaza başvurusu yapılmadı.

1. [x] Skill/agent kurulumu — `.claude/SOURCES.md`
2. [x] Tarayıcı testlerini depoya/CI'a taşı; bilinen hataları doğrula/düzelt
   - Tarayıcı testleri: tests/e2e (Playwright), CI'da "browser" işi; 15 test, iki test sunucusu (sunucu/tarayıcı kopyası)
   - Doğrulanan ve düzeltilen: sessiz kopya hataları, kısmi kopyaların atlanması, görsel yapı/ölçü denetimi,
     silme/geri almanın diğer akışlara yansımaması, pencere kapatma–geri hareketi yarışı (+ native Android geri),
     canlı sayacın özel faaliyeti yansıtması. Her biri önce başarısız olan bir testle yeniden üretildi.
   - Docker imajı bu ortamda derlendi ve çalıştı (/health, sharp yüklü); vekil sertifikası yalnızca geçici Dockerfile'da
3. [ ] Biçimlendirme, linter, tip denetimi, modüllere ayırma, ölü kod
4. [ ] Hız: ikon alt kümesi, harita tembel yükleme, JS küçültme; UI tutarsızlıkları
5. [ ] Güvenlik, sunucu dışı yedek, veri dışa aktarma, gizlilik/destek sayfaları, güncelleme/geri dönüş belgesi
6. [ ] Native bildirim, e-posta, GEDCOM, video, sesli yorum, çevrimdışı okuma, yönetici paneli
7. [ ] Test ortamları: web demo bağlantısı, cihaz ölçüsü seçimi, Android/iOS derlemeleri, Appetize
8. [ ] CI doğrulama, kapasite testi, kılavuz, tek dosya demo, teslim

Sıradaki iş: 3 (hata yönetimi, global/ölü kod, tip denetimi, modüller)
