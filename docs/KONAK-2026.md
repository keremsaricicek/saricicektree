# Sarıçiçek Konağı — 21 Eylül 2026

Bu sürüm, kullanıcının son düzen kararlarını uygular. Önceki fikirlerin 5 ve 11 numaralı maddeleri kapsam dışında; özel mesaj araması ortak aramadan ayrıdır.

## Görünen değişiklikler

- Marka Sarıçiçek Konağı. Hayat, büyük tarih/başlık veya Bahsedilenler/Soy ağacımız araçları yerine doğrudan sosyal akışla açılır.
- Ortak akış etiket gerektirmez. Yeni içerik aileye açıktır; eski içeriklerin erişim sınırları ve veli korumaları korunur.
- Paylaşma: tek + menüsü, metin, fotoğraf veya soru. Etkinlik/Anı/Kişiler/kitle seçenekleri yoktur. Etiketleme @ ile, isim/lakap araması ve klavye desteğiyle çalışır.
- Üç ana eylem: beğen, yorum, kaydet. Akış kartının altında doğrudan yorum alanı vardır. Üç nokta menüsünde düzenleme, bağlantı kopyalama, kaydetme ve yetkiye göre kaldırma/sabitleme bulunur.
- Üst barda bildirim merkezi. Etiket ve kendi gönderilerine gelen yorumlar grupludur. Kategori tercihleri hesap bazında sunucuda saklanır; mesaj tercihi web push gönderimini de kapatır.
- Avlu yüklemesi Fotoğraf → Hikâyesi → Kaydet olarak üç adımdır. Çoklu fotoğrafta ortak tarih/yer/kişiler/hikâye uygulanabilir; her kare ayrı düzenlenebilir. Yeni görünürlük seçici yoktur.
- Hayat’ta da paylaş seçeneği paylaşım yazısını açar. Avlu’da yalnızca kalıcı fotoğraf hikâyesi vardır; sohbet yazısı ve yorumlar Avlu’ya aktarılmaz.
- Avlu’da mozaik/zaman çizelgesi, yıl seçimi; fotoğraf görüntüleyicide kaynak/çeken bilgileri ayrıntılarda. Ayrı katkı sohbeti ve kitle düğmesi kaldırıldı.
- Soy ağacında kuşak sıraları, yan yana eş kartları, eğri bağlantılar, odaklanma ve okunur yakınlaştırma kontrolleri.
- Genel sunucu araması lakapları ve erişilebilir Hayat gönderilerini kapsar. Mesaj araması yalnızca kendi birebir ve mevcut grup konuşmalarını içerir.
- Kaldırılan Hayat gönderisi beş dakika içinde sunucu üzerinden geri alınabilir; başkasının kaydını geri alma ve süre aşımı reddedilir.
- Cihazda yazı ve fotoğraf taslakları; bağlantı geri gelince kullanıcı gönderir. Oturum kapatıldığında bu hesaba ait taslaklar temizlenir.
- Kolay görünüm, ilk adım rehberi, eylemli boş durumlar, gezinme konumu/filtre hatırlama. Mobilde Hayat / Avlu / + / Soy ağacı / Mesajlar.
- Yönetimde inceleme merkezi: fotoğraf bilgisi önerileri ile mevcut arşiv katkıları ve mesaj şikâyetlerine ulaşım.
- Güncel gerçek ekranlarla resimli kılavuz, çevrimdışı HTML önizlemesinin içinde de bulunur.

## Kapsam ve sınırlar

- Önceden kaydedilmiş özel/seçili/grup içeriklerinin erişimini bu sürüm topluca değiştirmez. Eski API kayıtlarını okuyabilmek için eski yetkilendirme türleri sunucuda korunmuştur; yeni paylaşım arayüzünde kitle/grup seçimi yoktur.
- Fotoğraf taslakları ve yazı taslakları cihaz içindir; cihazlar arasında eşitlenmez. Tarayıcı depolaması kullanılamazsa arayüz uyarır. Gönderim ve fotoğraf kayıtları canlı sunucuda kalıcıdır.
- Bildirim merkezi uygulama içidir. Cihaz push desteği mevcut mesaj servisine bağlıdır; bu sürüm diğer kategoriler için yeni dış push veya e-posta hizmeti iddia etmez.
- Geri alma bu sürümde Hayat gönderilerine uygulanır. Diğer arşiv kayıtlarının önceki yönetici geri yükleme akışı korunur.
- Ağaç aynı görünümde en fazla 120 kart gösterir; arama tüm erişilebilir kişi kayıtlarına ulaşır. Nesil kayıtlı ilişkilerden hesaplanır.
- Haftalık özet ve Avlu içi arama yüklenmiş kayıtlarla sınırlıdır; tüm arşiv için üst bar araması kullanılmalıdır.
- Mağaza yayını, özel alan adı/e-posta kutusu kurulumu ve önceki dış servis bağımlılıkları bu arayüz sürümüyle tamamlanmış sayılmaz. Önceki stres testi üretim kapasitesi garantisi değildir.

## Doğrulama

- 26 Eylül doğrulamasında 59 otomatik kontrolün tamamı geçti.
- Üç yeni sunucu testi: etiketsiz gönderi/Türkçe/lakap araması ve gizlilik; süreli/yetkili geri alma ve gruplu yorum bildirimleri; mesaj aramasında kullanıcı/grup ayrımı ve tercihlerin hesap izolasyonu.
- Tarayıcıda @ seçimi, gönderi/yorum, üç adımlı çoklu fotoğraf yüklemesi, zorunlu alan hatası ve Hayat yazısının koşullu görünürlüğü denendi.
- Örnek verilerle masaüstü akış, Avlu, fotoğraf görüntüleyici, soy ağacı ve profil kontrol edildi. Telefon için 390 px çerçeve testi güvenlik başlığı nedeniyle açılamadı; mobil görsel doğrulama tamamlanmış sayılmaz. Bu kontroller canlı aile kayıtlarını değiştirmez.
