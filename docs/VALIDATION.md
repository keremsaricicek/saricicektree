# Doğrulama durumu

## Geçen otomatik kontroller

`npm test`: 18 kontrol geçti.

- Anonim aile verisi erişiminin reddi; Origin ve CSRF koruması.
- Gerçek kişi oluşturma, ebeveyn / çocuk bağı, döngü engeli.
- Davetin tek kullanım olması; e-posta ve rolün sunucudaki davete bağlanması.
- Üyenin kişi / yetki / ayar yönetememesi; moderatörün yöneticiye özel işlemleri yapamaması.
- Özel fotoğraf erişimi, SVG reddi, kişi etiketleri, moderatör onayı.
- Üye içerik düzenlemesinin tekrar onaya dönmesi.
- Kaldırılan kişinin geri yüklenmesi ve ilişkilerinin korunması.
- 1.202 kişiyle 50 eşzamanlı kimlik doğrulamalı okuma: yerel testte yaklaşık 0,3–0,4 saniye. Bu üretim SLA'sı değildir.
- Sunucu yeniden başlatıldığında veri ve oturumların korunması.
- Rol / aktiflik değişiminde oturum iptali; tek kullanımlık şifre yenileme.
- Geçersiz tarih, artık gün ve yıl değişimi.
- Ana ekranların render fonksiyonları; üye görünümünde yönetim kontrollerinin olmaması; metinlerin HTML olarak çalıştırılmaması.

## Görsel kontrol

Yayımlama sisteminin oluşturduğu masaüstü ekran görüntüsü incelendi. Menü, başlık, karşılama alanı, istatistikler ve tipografi görüntülendi. `desktop-preview.png` gerçek yayımlanmış önizlemenin görüntüsüdür.

Telefon düzeni için 700 / 980 / 1200 px kırılımları, mobil alt menü, tek sütuna dönen alanlar ve kaydırılabilir ağaç uygulanmıştır. Canlı önizleme ayrıca `mobile.html` içinde 390 px genişlikte bir telefon görünümü sunar. Özel site ChatGPT oturumu istediği için tarayıcıyla etkileşimli masaüstü/mobil uçtan uca kontrol tamamlanamamıştır; otomatik render kontrolleri gerçek tarayıcı görsel kontrolünün yerine geçmez.

## Henüz yapılmayan dış kurulumlar

- Kullanıcının GitHub hesabında yeni `saricicek-family` deposu oluşturulması ve bu depoya push: bağlantıda repo oluşturma işlemi yok; tarayıcıda GitHub oturumu gerekli.
- Satın alınmış alan adı ve DNS bağlantısı.
- Üretim Node sunucusunun kullanıcının barındırma hesabına kurulumu.
- Gerçek alan adına bağlı e-posta kutuları ve otomatik e-posta gönderimi.
- 1.000 eşzamanlı gerçek kullanıcıyla yük testi.

Yayımlanmış Sites sürümü özel, örnek verili etkileşimli önizlemedir. Gerçek çok kullanıcılı Node sunucusu kaynak paketinde bulunur; önizleme ile ortak veri deposu paylaşmaz.


## Hosted backend — 2026-09-19

- Added Worker fetch runtime with generated D1 migrations and private R2 media.
- 21 tests passed: standalone server, domain rules, frontend render fixtures and hosted API flows.
- Hosted tests use real SQLite via a D1-shaped adapter and an in-memory R2 test adapter. These are not live production storage or browser end-to-end tests.
- Verified missing identity, CSRF/origin rejection, nonmember isolation, stable identity owner binding, recipient-bound invitations, frozen accounts, pending photo moderation, private media, persistent request-to-request records, tags, restore, settings/export and cycle detection.
- Source build emits one self-contained ESM Worker plus platform migration metadata.
- Browser/WebMCP validation remains unavailable in the managed preview session. Optional read-only search tool is feature-detected; no UI depends on it.
- Current Site audience remains owner-only. App invitation and platform viewer access are separate gates.


## Chat, atlas and mobile source extension

25 automated tests passed, including private conversation isolation, idempotent sends, inbox acknowledgements, blocking, scoped reporting, explicit location consent, server-side rounding, expiration/revocation, private PDF moderation, attendance and member account removal. Native projects synchronized successfully. Android local compilation was blocked downloading Gradle by unavailable network; the local JDK is 17 while the build workflow selects 21. No local Xcode/iOS build or physical-device background tests were possible. Browser visual/E2E validation remains unavailable; render fixtures are not a browser substitute. Mobile store release is blocked by the specific items in MOBILE-RELEASE.md.
