# Tasarım sistemi

Arayüzün görünümü `public/app.css` üzerinden yüklenir. Stiller üç katmandadır:

- `vendor`: Leaflet.
- `legacy`: önceki sayfa stilleri (`style.css` … `konak.css`). Yeni sistem bunların üstündedir; seçici gücüyle yarışmaya gerek yoktur.
- `ds`: `public/ds/` altındaki tasarım sistemi.

| Dosya | İçerik |
|---|---|
| `tokens.css` | Renk, yazı ölçeği, köşe, gölge, hareket ve yerleşim değişkenleri |
| `fonts.css` | Projeye gömülü Inter ve Fraunces (OFL lisansları `assets/fonts/`) |
| `base.css`, `components.css` | Tipografi, düğmeler, segmentli seçici, alanlar, kartlar, pencereler (telefonda alttan açılan sayfa) |
| `shell.css` | Üst çubuk, alt menü, sayfa kabı |
| `feed.css`, `viewer.css` | Hayat akışı, satır içi yorumlar, tam ekran fotoğraf görüntüleyici |
| `tree.css`, `avlu.css` | Soy ağacı, Avlu galerisi, fotoğraf hikâyesi ekranı, yükleme adımları |
| `pages.css`, `chat.css` | Diğer sayfalar, mesajlaşma |

Davranış katmanı `public/ui.js` en son yüklenir: gönderi kartı, satır içi yorum dizisi, fotoğraf görüntüleyici, soy ağacı yerleşimi, Avlu galerisi, profil başlığı, menü/hesap sayfaları ve mesaj penceresi ayrıntıları buradadır. Veri akışı ve API çağrıları önceki modüllerde kalır.

Kurallar: yeni renk veya ölçü eklemeden önce `tokens.css` değişkenlerini kullanın; telefonda giriş alanları en az 16 px, dokunma hedefleri en az 44 px olmalıdır.
