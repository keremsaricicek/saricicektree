# UI tamamlama kontrol listesi

Durum: [ ] bekliyor · [~] sürüyor · [x] bitti · [!] dış engel

1. [x] Fotoğraf türevleri (srcset, boyut bilgisi, odak noktası, erişim, önce/sonra ölçüm)
2. [ ] Eski CSS temizliği, üretim CSS küçültme, tek dosya HTML
3. [x] Hayat canlı güncelleme, emoji tepkiler, yorum beğenisi
4. [x] Mesaj durumları, yeniden gönderme, fotoğraf eki önizleme, sesli mesaj dalgası
5. [x] Soy ağacı portreler, küçük harita, büyük ağaç performansı
6. [x] Avlu açılış animasyonu, gerçek yükleme ilerlemesi, hata sonrası yeniden deneme
7. [ ] Gece modu (açık/koyu/sistem), geçişler, hareket azaltma
8. [ ] Erişilebilirlik, Kolay görünüm, klavye/güvenli alan/geri tuşu (emülasyon) + telefon kontrol listesi
9. [ ] Hayat şeridi, Bugün geçmişte bildirimleri, takvim/arşiv/yönetim kontrolleri
10. [ ] Testler, güvenlik incelemesi, yedek uyumu, kılavuz/belge, tek dosya HTML, commit/push

Notlar
- Fotoğraf ölçümü (heritage.webp, archive.webp; 1536×1024): orijinal 484/418 KB → 640 px 60/53 KB, 1080 px 165/137 KB, 320 px 16 KB.
- Canlı akış: iki hesapla yerel sunucuda denendi; yorum/tepki/beğeni yenilemeden geldi, taslak ve kaydırma korundu, yeniden bağlanınca çoğalma yok.
- Mesaj: çevrimdışı gönderim 'Gönderilemedi' + 'Yeniden dene' gösterdi; bağlantı dönünce tek kopya gitti (clientId aynı). Fotoğraf eki önizlemesi ve sahte mikrofonla ses kaydı/dalga çizimi tarayıcıda denendi; gerçek telefon mikrofonu denenmedi.
- Soy ağacı: 160 kişi sınırı kaldırıldı (tüm kişiler ve bağlar çizilir; 300 kişilik denemede 150/150 eş, 149/149 ebeveyn, 13/13 evlat edinme çizgisi). Portreler 320 px kopyadan, yoksa baş harfler. Masaüstü küçük harita. Ölçüm (800 kişi, CPU 4× yavaş): ilk çizim 668 → 367 ms, yerleşim 346 → 137 ms; kaydırma p50 16,7 ms.
- Avlu: karttan görüntüleyiciye büyüyerek açılış ölçülen iki kutu arasında (masaüstü 345×230 → 746×498, telefon 181×120 → 358×239); hareket azaltmada animasyon yok. Yükleme yarıda kesilince bilgiler ve fotoğraf korundu, "Yeniden dene" tek kayıt oluşturdu (aynı clientId).
