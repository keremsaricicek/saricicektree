# Güncel özellik durumu — 19 Eylül 2026

Son sosyal uygulama güncellemesi ve ilk beş altyapı maddesinin ayrıntısı [SOCIAL-UPGRADE.md](SOCIAL-UPGRADE.md), stres ölçümleri [STRESS-RESULTS.md](STRESS-RESULTS.md) içindedir.

Bu belge seçilen fikirlerin uygulamadaki gerçek kapsamını gösterir. Liste ve kullanıcı seçimleri FEATURE-WISHLIST.md içinde korunur.

| İstek | Uygulanan kapsam |
| --- | --- |
| Bölüm adları ve tasarım | Aile Konağı, Avlu, fıstık ağacı simgeli Soy Ağacı, Geçmişten Günümüze, Bizimkiler Nerede?; Türkçe, zeytin/ekru arayüz |
| Akrabalık yolu | Kayıtlı bağlardan en kısa yol, doğrudan ve temel geniş aile yakınlığı; eksik bağlar belirtilir |
| Sesli tarih, tarif, fotoğraf hikâyeleri | Yazı, bağlantılı fotoğraf, ses/video yükleme ve cihaz izinli ses kaydı; çoklu yorum, moderasyon |
| Sorular ve kaynaklar | Profil/fotoğraf/belge bağlantısı, yanıtlar, moderatör onayı, anlatıcı ve doğrulanma bilgisi |
| Gruplar | Yalnızca üyelerin erişebildiği sohbet, üye ekleme ve ayrılma; 5 saniyede yenileme |
| Buluşmalar | Tarih oylaması, tek seferde takvime kesinleştirme, katılım yanıtı, Avlu fotoğraflarından bağlantılı albüm |
| Meslek / yardım rehberi | Kullanıcının açık tercihiyle eklenen gönüllü kayıtlar |
| Anma ve başarılar | Profil bağlantılı hatıra, başarı, kutlama ve ana sayfa akışı |
| Aile kitabı | Görülebilen kişiler, iki yönlü bağlar, fotoğraflı arşiv katkıları; tarayıcıdan PDF olarak kaydetme |
| Haftalık özet | Ana sayfada son katkılar ve sayaçlar; e-posta bülteni göndermez |
| Göç yolculuğu | Haritadan başlangıç/bitiş seçimi, yıl, kişi bağlantısı ve çizilen rotalar |
| Zaman kapsülleri | Gelecekte açılan metin/fotoğraf/ses/video; sunucuda tarih kontrolü, mühürlenmiş içerik ve dosya erişimi kapalı |
| Arşiv araması | Tüm yetkili kişi/fotoğraf/olay/belge/arşiv kayıtlarında sunucuda sayfalı FTS5 araması; anlamsal AI veya belge içi OCR araması değildir |
| Kişi birleştirme | Benzer isim önerisi, yönetici/moderatör birleştirmesi, bağ ve etiket aktarımı, sonraki değişikliklerde korumalı geri alma |
| Büyükler için kolay kullanım | Büyük yazı/sade görünüm, ses kaydı; cihazın mikrofon izni gerekir |
| Yakınımda akrabam | Paylaşılmış ikamet/live pinleri, şehir araması ve birebir sohbet; otomatik buluşma talebi bildirimi yok |
| Devamlılık | Ek moderatör, yönetici devri. Tek kurucu rolü; eşzamanlı ikinci kurucu yok |
| Tarihsel aile | Yıl sürgüsü, yıl sonu yaşayanlar/yaşları, doğum-vefat-etkinlik-arşiv zaman çizelgesi; eksik tarih uyarısı |
| Aile yarışması | Kayıtlardan soru önerileri, çoktan seçmeli quiz, sunucuda puanlama ve tek katılım |
| Dijital sergiler | Temalı fotoğraf seçkisi, hikâye ve ses/video sunumu |
| Fotoğraf gizliliği ve veli | Özel fotoğraf erişimi, etiketler, veliye bağlı temel profil, aile bağları, olay, ikamet ve medya koruması; veli ve aile yöneticisi erişebilir |
| İki aşamalı giriş | Şifrelenmiş TOTP anahtarı, tek kullanımlık kod kontrolü, ikinci faktör oturumu; 10 tek kullanımlık kurtarma kodu, yenileme ve indirme |
| Yedekler | Medya kopyaları ve bütünlük denetimli arşiv yedeği. Node'da bağımsız günlük zamanlayıcı; Sites'ta ziyaret tetiklemesi sürer. Ayrı depo felaket yedeği değil |
| Gerçek harita | Uzak döşeme hizmeti istemeyen dünya sınırları, pinler, izinli canlı konum ve iptal. Sokak haritası değil |
| Web ve mobil | Aynı HTTPS veri kaynağını kullanan Android/iOS kaynakları, konum ve mikrofon izinleri; mağazada yayımlanmış uygulama yok |

## Henüz etkin olmayanlar

- Fotoğraf restorasyonu / renklendirme: özgünü koruyan, izinli ve etiketli sunucu entegrasyonu yazıldı. OPENAI_API_KEY yok; gerçek işlem devre dışı ve servis testi yapılmadı. OpenAI Developers bağlantısının kurulması gerekir.
- Alan adı ve kişisel e-posta kutuları: alan adı sahipliği, DNS ve posta sağlayıcı hesabı yok. Otomatik davet e-postası gönderilmez.
- App Store / Google Play: geliştirici hesapları, imzalama, mağaza metinleri/inceleme ve fiziksel cihaz doğrulaması gerektirir; yayımlanmadı.
- 1000 paralel yerel istek ve SSE ilk bağlantısı test edildi; sürekli üretim kapasitesi garanti edilmez. Gerçek cihaz arka plan konumu ve bildirimleri doğrulanmadı.
- Canlı site sahibine özel. Uygulama daveti yanında platform erişimi de gerekir.

Uygulanmamış dış kurulumlar tamamlanmış olarak sunulmaz. Sohbetler ve kapsüller uçtan uca şifreli değildir; sunucu yöneticisi veri tabanı yedeğini yönetebilir.
