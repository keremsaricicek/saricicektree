# Sosyal aile uygulaması — uygulama ve doğrulama

## Gezinme

Masaüstündeki sol menü kaldırıldı. Marka, beş ana bölüm, arama, sohbet, tüm bölümler ve hesap üst çubukta. Dar ekranda ana bölümlerin simgeleri erişilebilir adlarını korur; telefonda mevcut beşli alt menü sürer. Diğer bölümler üstteki tüm bölümler düğmesinden açılır. Tema korunup yazı ve yüzeyler sadeleştirildi.

## İlk beş altyapı maddesi

1. **Sohbet:** Web istemcisinde SSE olay akışı. Aynı Node/Worker örneğinde yeni mesaj anında akışı uyandırır. Farklı Worker örnekleri için 5 saniyelik sunucu tarafı veri kontrolü vardır; dağıtık WebSocket/Durable Object yayın ağı değildir. Akış 25 saniyede yenilenir, bağlantı tekrarında yazılan mesaj korunur. Native köprüde mevcut periyodik yenileme güvenli geri dönüş olarak kalır. Mesajlaşma e-posta değildir.
2. **Bildirim:** Sohbet ekranındaki “Telefon bildirimleri” ile desteklenen tarayıcı/PWA için Web Push aboneliği açılır/kapatılır. VAPID anahtarı sunucuda üretilip şifreli saklanır; CSRF ve izin kontrolleri uygulanır. Yalnızca izinli push sağlayıcı adresleri kabul edilir. Bildirim genel metindir; gönderen adı veya mesaj içeriği dış push servisine gönderilmez. Gerçek telefona teslimat test edilmedi. Native APNs/FCM mağaza yapılandırması yapılmadı.
3. **Arama:** Kişiler, Avlu, olaylar, belgeler ve arşivde sunucu taraflı, sayfalı arama. FTS5 ile sözcük başlangıcı araması ve Türkçe karakter normalizasyonu. Yetki, moderasyon, özel fotoğraf, veli ve açılmamış kapsül denetimleri SQL tarafında uygulanır. Kaynak kayıt değişiklikleri arama indeksine tetikleyicilerle yansır. Eski indekssiz kayıtlar güvenli tarama yoluyla aranır; yönetici ziyaretindeki sınırlı bakım bunları indekse taşır. Sohbet metinleri ve belge dosyasının iç metni/OCR aranmaz.
4. **Yedek:** Sürüm 3 yedekler fotoğraf/PDF/ses/video dosyalarının ayrı kopyalarını ve SHA-256 bütünlük değerlerini içerir. Eksik medya geri eklenir, mevcut dosyalar ve kayıtlar ezilmez; bozuk yedek geri yüklemeyi durdurur. Önceki sürüm 2 yedekler yalnızca kayıt kapsamını korur. Node sürümünde her UTC gününde 02:00 sonrasındaki bağımsız zamanlayıcı ziyaret gerektirmeden çalışır. **Mevcut Sites yayınına bağımsız cron bağlanamadı; burada günlük işlem hâlâ yönetici ziyaretiyle tetiklenir.** Aynı R2 hesabındaki kopyalar bağımsız felaket yedeği değildir. Kullanıcı hesapları, kimlik sırları ve sohbetler bu arşiv yedeğinin kapsamı dışındadır. Çok büyük medya arşivleri için kuyruklu/parçalı iş ve ayrı depoya aktarım gerekir.
5. **Hesap kurtarma ve veli:** TOTP etkinleştirilince 10 yüksek entropili tek kullanımlık kurtarma kodu bir kez gösterilir/indirilebilir. Sunucuda yalnızca özetleri tutulur. Yeni doğrulayıcı koduyla tüm kurtarma kodları yenilenebilir; kullanılan kod tekrar kabul edilmez. Veli atanan temel kişi profili, aile bağları, ikameti, bağlantılı olay/medya/arşiv kayıtları diğer üye ve moderatörlerden saklanır. Veli ve aile yöneticisi temel profile erişir; özel içerik sahipliği ayrıca kontrol edilir.

## Test

- 44 otomatik test: önceki testlere kurtarma kodu, tam çocuk profili gizliliği, geniş arama, medya geri yükleme/bütünlük, push abonelik güvenliği, VAPID imza doğrulaması ve SSE alıcı izolasyonu eklendi.
- İç tarayıcıda üst menü, tüm bölümler penceresi ve sohbet ekranı denendi. Masaüstünde yatay taşma ve karşılama düğmesinin kesilmesi kontrol edildi. Gerçek mobil cihaz ve uzak push teslimatı testi yapılmadı.
- Kontrollü yerel stres testi: 1000 ayrı oturum, 5000 kişi, 5000 arşiv kaydı, 20000 başlangıç mesajı. 100/250/500/1000 paralel istek aşamaları ve 1000 SSE ilk bağlantısı. Son ölçümler [STRESS-RESULTS.md](STRESS-RESULTS.md) ve JSON dosyasında.
- 1000 paralel istek düzeyinde p95 yaklaşık 6,2 saniye; sıfır hata, veri bütünlüğü temiz. Bu gecikme altında üretim kapasitesi garantisi verilmez. D1/R2 canlı yükü, medya yüklemeleri, uzun süreli oturumlar ve gerçek mobil kullanım ayrıca ölçülmelidir.

## Kullanım

- Üstte sohbet simgesine bas → daveti kabul etmiş aile üyesini seç → mesaj gönder.
- Sohbet içindeki Telefon bildirimleri → Bu cihazda aç. iPhone’da uygun sürümde ana ekrana eklenen web uygulaması gerekebilir; tarayıcı desteklemiyorsa açıklama gösterilir.
- Üstte arama → en az iki karakter → sonuç veya Daha fazla sonuç. Gerçek sunucu araması indirilen örnek HTML'de çalışmaz.
- Hesabım → iki aşamalı doğrulama → etkinleştirme sonrası kurtarma kodlarını güvenli yerde sakla.
- Tüm bölümler → Aile ayarları → Ailenin devamlılığı → veli ata / yedekleri yönet.

## Dış kurulumlar

Mağaza hesapları/imzalama, gerçek telefon doğrulaması, alan adı/e-posta ve OpenAI görüntü API anahtarı önceki gibi bekliyor. Haftalık e-posta bülteni ve sokak haritası bu turda eklenmedi. Site sahibi dışındaki kişilere platform erişimi ayrıca açılmalı.

## Teknik dayanak

- https://developers.cloudflare.com/d1/sql-api/sql-statements/ — D1 FTS5 desteği.
- https://www.sqlite.org/fts5.html — metin indeksleme ve sorgu.
- https://www.rfc-editor.org/rfc/rfc8292.html — VAPID imzası.
- https://www.rfc-editor.org/rfc/rfc8030.html — Web Push iletimi.
