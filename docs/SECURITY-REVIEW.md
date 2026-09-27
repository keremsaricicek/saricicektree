# Güvenlik denetimi (2026-09-27)

Kod üzerinden yapılan denetim ve testlerle doğrulanan sonuçlar. Dış sızma testi yapılmadı. Hukuki uygunluk (KVKK/GDPR) incelemesi yapılmadı; bu inceleme işletmeciye aittir.

## Durum özeti

| Konu | Durum | Kanıt |
| --- | --- | --- |
| Oturum | HttpOnly, SameSite=Lax, üretimde Secure çerez. Veritabanında yalnız özet tutulur, süre 7 gün. Rol değişince, hesap kapanınca ve silinince oturumlar biter. | `tests/api.test.mjs` |
| CSRF | Değiştiren her istekte `Origin` = uygulama kökeni, JSON içerik türü ve oturuma bağlı `X-CSRF-Token` aranır. | `tests/api.test.mjs` "origin protection" |
| XSS | CSP `script-src 'self'` (satır içi betik yok). Arayüz güvenli şablon yardımcısı (`html```) kullanır. Kişi adları, yorumlar ve mesajlar metin olarak gösterilir. | `tests/e2e/rendering.spec.mjs` |
| Yükleme | Görseller gerçek yapılarından tanınır; ölçü ve piksel sınırı dosyanın kendisinden okunur. SVG ve kılık değiştirmiş dosyalar reddedilir. Küçük kopyaların gerçek ölçüsü denetlenir. | `tests/media.test.mjs`, `tests/api.test.mjs` |
| Özel medya | Fotoğraf kopyaları (`?w=`), mesaj ekleri, akış medyası, belgeler ve kapsül medyası her istekte asıl kaydın erişim kuralına bakar. Ekler `sandbox` CSP ile sunulur. | `live`, `experience`, `feed`, `archive`, `hosted` testleri |
| Bildirimler | Push içeriği genel metindir, aile içeriği taşımaz. Bildirim listesi güncel görünürlüğe uyar. Canlı sayaç, görülemeyen etkinlikle ilerlemez. | `archive.test` "web push", `live.test` |
| Hız sınırları | Giriş, davet kabulü, şifre yenileme, 2FA, kurtarma kodu, yükleme, yorum, mesaj, şikâyet, konum, dışa aktarma ve hata raporu sınırlıdır. | aşağıdaki düzeltme |
| Hesap silme | Kişisel satırlar, oturumlar, şifre özeti ve davet kaydı silinir; silme sonrası hiçbir tablo üyenin adını ya da e-postasını taşımaz. | `tests/account.test.mjs`, `tests/api.test.mjs` |
| Veri dışa aktarma | Yalnız üyenin kendi verisi çıkar. Başka üyelerin e-postası, özel içeriği ve şifre özeti dosyaya girmez. | `tests/account.test.mjs`, `tests/e2e/account.spec.mjs` |
| Sırlar | 2FA şifreleme anahtarı ayarlarla birlikte hiçbir API yanıtına girmez. Hata kayıtlarında içerik ve kişisel bilgi yoktur. | `tests/api.test.mjs`, `tests/ops.test.mjs` |
| Yedek | Tam yedek AES-256-GCM ile şifrelenir. Bozuk ya da değiştirilmiş dosya geri yüklenmez. | `tests/backup.test.mjs` |

## Bu turda bulunup düzeltilen açıklar

1. **Giriş sınırı bütün aileye ortaktı.** Caddy arkasında her bağlantı vekil sunucudan geldiği için bütün aile tek bir sınırı paylaşıyordu. Herhangi birinin 40 yanlış denemesi, aileyi 15 dakika girişten kilitliyordu.
   - `TRUST_PROXY=1` ile ziyaretçi adresi artık ayrı sayılıyor.
2. **Hesap silme bazı kişisel verileri geride bırakıyordu:**
   - davet kaydı (e-posta adresiyle);
   - tercihler, tepkiler, yorum beğenileri, oylar, veli bağı ve profil bağı;
   - Node'da oturumlar, şifre yenileme bağlantıları ve şifre özeti.
3. **Ortak çekirdek API'ye geçiş sırasında önlenen sızıntı.** Ayarlar yanıtına 2FA anahtarının girmesi bu geçişte önlendi ve testle korundu.
4. **Avlu görünüm düğmelerinin telefonda erişilebilir adı yoktu.**

## Açık kalanlar (karar ya da hesap gerektirir)

- **Kaldırılan içerik kalıcı olarak silinmiyor.** Yöneticinin geri getirebilmesi için "silinmiş" işaretiyle kalıyor. Otomatik kalıcı silme süresi bir politika kararıdır. Gizlilik sayfası bunu olduğu gibi söylüyor.
- **Mesajlarda uçtan uca şifreleme yok.** Gizlilik sayfasında açıkça yazıyor.
- **Hesap silme için e-posta desteği.** Giriş yapamayanlar için gerçek bir destek adresi (`SUPPORT_EMAIL`) ve veri sorumlusu adı (`SITE_OPERATOR_NAME`) işletmeci tarafından verilmeli.
- **Caddy ve `X-Forwarded-For`.** Caddy'nin bu başlığa ziyaretçi adresini yazdığı, bu oturumda gerçek bir Caddy kapsayıcısıyla denenmedi (Docker Hub erişim sınırı). Canlıya almadan önce iki farklı ağdan deneme yapılmalı.
