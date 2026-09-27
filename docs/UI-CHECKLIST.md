# UI tamamlama kontrol listesi

Durum: [ ] bekliyor · [~] sürüyor · [x] bitti · [!] dış engel

1. [x] Fotoğraf türevleri (srcset, boyut bilgisi, odak noktası, erişim, önce/sonra ölçüm)
2. [x] Eski CSS temizliği, üretim CSS küçültme, tek dosya HTML
3. [x] Hayat canlı güncelleme, emoji tepkiler, yorum beğenisi
4. [x] Mesaj durumları, yeniden gönderme, fotoğraf eki önizleme, sesli mesaj dalgası
5. [x] Soy ağacı portreler, küçük harita, büyük ağaç performansı
6. [x] Avlu açılış animasyonu, gerçek yükleme ilerlemesi, hata sonrası yeniden deneme
7. [x] Gece modu (açık/koyu/sistem), geçişler, hareket azaltma
8. [x] Erişilebilirlik, Kolay görünüm, klavye/güvenli alan/geri tuşu (emülasyon) + telefon kontrol listesi
9. [x] Hayat şeridi, Bugün geçmişte bildirimleri, takvim/arşiv/yönetim kontrolleri
10. [ ] Testler, güvenlik incelemesi, yedek uyumu, kılavuz/belge, tek dosya HTML, commit/push

Notlar
- Fotoğraf ölçümü (heritage.webp, archive.webp; 1536×1024): orijinal 484/418 KB → 640 px 60/53 KB, 1080 px 165/137 KB, 320 px 16 KB.
- Canlı akış: iki hesapla yerel sunucuda denendi; yorum/tepki/beğeni yenilemeden geldi, taslak ve kaydırma korundu, yeniden bağlanınca çoğalma yok.
- Mesaj: çevrimdışı gönderim 'Gönderilemedi' + 'Yeniden dene' gösterdi; bağlantı dönünce tek kopya gitti (clientId aynı). Fotoğraf eki önizlemesi ve sahte mikrofonla ses kaydı/dalga çizimi tarayıcıda denendi; gerçek telefon mikrofonu denenmedi.
- Soy ağacı: 160 kişi sınırı kaldırıldı (tüm kişiler ve bağlar çizilir; 300 kişilik denemede 150/150 eş, 149/149 ebeveyn, 13/13 evlat edinme çizgisi). Portreler 320 px kopyadan, yoksa baş harfler. Masaüstü küçük harita. Ölçüm (800 kişi, CPU 4× yavaş): ilk çizim 668 → 367 ms, yerleşim 346 → 137 ms; kaydırma p50 16,7 ms.
- Avlu: karttan görüntüleyiciye büyüyerek açılış ölçülen iki kutu arasında (masaüstü 345×230 → 746×498, telefon 181×120 → 358×239); hareket azaltmada animasyon yok. Yükleme yarıda kesilince bilgiler ve fotoğraf korundu, "Yeniden dene" tek kayıt oluşturdu (aynı clientId).
- CSS: ölü eski kurallar kaldırıldı (eski 8 dosya 109,5 → 80,3 KB); 42 ekran görüntüsünde piksel farkı yok. Üretimde tek küçültülmüş dosya: 21 istek 268,6 KB (gzip 65,8 KB) → 1 istek 205,8 KB (gzip 41,3 KB).
- Gece modu: Hesabım → Görünüm (Açık/Koyu/Sistem), bu cihazda hatırlanır; 13 sayfa + 10 pencere koyu temada taranıp parlak yüzey/düşük kontrast düzeltildi (kalanlar bilinçli açık yeşil ana düğmeler).
- Erişilebilirlik: açık temada --muted 3,6:1 → ≥4,5:1 (#646b5c); etiketsiz simge düğmesi düzeltildi; tepki menüsü ok tuşlarıyla gezilir; Kolay görünüm daha koyu ikincil metin ve 48 px dokunma alanı verir.
- Emülasyon (390×844, klavye için 480 px yükseklik): yorum ve mesaj alanında klavye algılandı, alt menü gizlendi. Hata bulundu ve düzeltildi: Android'de klavye açılınca mesaj penceresi yeniden eklenip odağı kaybediyordu. Geri hareketi önce lightbox'ı, sonra görüntüleyiciyi kapatıyor. Güvenli alanlar 47/34 px ile doğru. Gerçek cihaz testleri docs/PHONE-CHECKLIST.md'de bekliyor.
- Hayat şeridi: profil "Hayat hikâyesi" sekmesinde doğum, tarihi kayıtlı evlilik, çocukların doğumu, kişinin olayları, etiketli tarihli fotoğraflar, vefat; tarihsiz kayıt gösterilmez, yıl/ay kesinliği korunur. Telefonda sayfa taşması yok.
- Bugün geçmişte: yalnızca günü kesin kayıtlar (yalnız yılı bilinen 1 Ocak fotoğrafı sayılmaz — denendi). Bildirimlerde ayrı grup; "Bugün geçmişte" tercihi kapatılınca gizlenir (denendi).
- Yönetim: yetki seçimi tasarımdaki açılır liste biçiminde, satır düğmeleri ayrık, İnceleme merkezi aralıkları düzeltildi. Takvim ve Arşiv zaten uyumluydu.
