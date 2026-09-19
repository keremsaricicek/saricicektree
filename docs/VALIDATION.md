# Doğrulama — 19 Eylül 2026

`npm test`: 44 test. Node gerçek HTTP sunucusu ve geçici SQLite; Worker için gerçek SQLite kullanan D1 adaptörü ve bellek içi R2. Bunlar üretim altyapısının canlı uçtan uca testi değildir.

- Davet, kimlik, rol, CSRF, moderasyon, kalıcılık, şifre sıfırlama ve oturum iptali.
- Aile bağı döngüsü, tarih doğrulama, profil ve ana sayfa render, kullanıcı metninin kaçışlanması.
- Birebir sohbet izolasyonu, engelleme, izinli konum, yuvarlama, sona erme ve paylaşımı kaldırma.
- Arşiv moderasyonu, özel içerik, kapsül tarih ve dosya erişimi; grup üyeliği; kaynak doğrulama.
- Fotoğraf gizliliği/veli kontrolü; kişi birleştirme ve geri alma.
- TOTP standart vektörü, şifreli kayıt, tekrar kod reddi ve ikinci faktör.
- Oylama/quiz sunucu puanlaması, buluşmayı bir defa oluşturma.
- Yönetici yedeği, günlük tekrar engeli ve eksik kayıt geri yükleme.
- Anahtarsız AI servisi kapalı; dış görüntü servisine gerçek çağrı yapılmadı.
- 1.202 kişi ve 50 paralel kimlikli okuma yaklaşık 0,35 saniye; 1000 eşzamanlı kullanıcı garantisi değildir.

## Tarayıcı kontrolü

İç önizlemede ana sayfa, Yaşayan Arşiv, Aile Bağlarımız ve dünya haritası görüntülendi. Tarif ekleme ve sayfa yenilemesi sonrası korunması denendi. Mehmet–Deniz akrabalık yolu doğru torun sonucunu verdi. Göç formunun harita seçim alanı görüntülendi. Bu işlemler örnek verili modda yapılmıştır; gerçek aile kayıtları eklenmedi.

Mobil CSS kırılımları mevcuttur; gerçek mobil viewport etkileşim testi ve fiziksel iOS/Android testleri tamamlanmadı. Native projeler önceki sürümde senkronize edildi; yeni mikrofon izinleri kaynaklara eklendi. İmzalı mağaza derlemesi alınmadı.

Son ek doğrulamalar: kurtarma kodlarının tek kullanımı/özetlenmesi, temel çocuk profilinin arama ve haritadan saklanması, indeksli eski kayıt araması, medya geri yükleme ve bozuk yedek reddi, push abonelik adres doğrulaması ve VAPID imzası, SSE alıcı izolasyonu. Üst menü ve sohbet ekranı tarayıcıda kontrol edildi. 1000 ayrı oturumla yerel stres ölçümleri STRESS-RESULTS.md içindedir.

Canlı platformun dağıtım sonucu ayrıca teslimatta bildirilir. Dış kurulumlar ve kapsam sınırları FEATURE-STATUS.md ve MOBILE-RELEASE.md içindedir.
