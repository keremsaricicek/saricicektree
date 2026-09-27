# Tasarım sistemi

Arayüzün görünümü `public/app.css` üzerinden kurulur. Üretimde `npm run build:client` bu dosyayı ve içe aktardıklarını tek, küçültülmüş `public/app.bundle.css` dosyasına toplar (sayfa bunu yükler; dosya depoya eklenmez). Stiller üç katmandadır:

- `vendor`: Leaflet.
- `legacy`: önceki sayfa stilleri (`style.css` … `konak.css`). Artık hiçbir ekranın üretmediği kurallar silindi; kalanlar hâlâ kullanılan eski bileşenler içindir. Yeni sistem bunların üstündedir; yeni bir üst katman eklenmez.
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

## Gece görünümü

`public/theme.js` sayfa boyanmadan önce çalışır ve `<html data-theme="light|dark">` yazar. Seçim (Açık / Koyu / Sistem) `localStorage` içinde `sf-theme` anahtarıyla tutulur; Sistem seçiliyken telefonun ayarı değişince tema da değişir. Koyu değerler `tokens.css` içindeki `:root[data-theme="dark"]` bloğundadır. Bileşenler renk yazmaz, yalnızca değişken kullanır; eski dosyaların `--kn-*` değişkenleri de aynı bloktan beslenir.

Koyu temada `--forest` açık fıstık yeşilidir ve `--on-dark` koyudur: ana düğmeler ve "benim" mesaj balonları bu çifti kullandığı için iki temada da okunur. Koyu zeminli özel kartlar için `--feature` / `--feature-ink` vardır.

## Hareket

Sayfa girişi (`.page-enter`), pencere açılışı, fotoğraf görüntüleyici ve Avlu kartından büyüyerek açılış kısa tutulur (200–380 ms). `prefers-reduced-motion` açıkken CSS animasyonları 1 ms'ye iner; JavaScript ile yapılan büyüme animasyonu hiç çalışmaz.

## Fotoğraf kopyaları

Sunucu özgün dosyayı saklar; tarayıcı 320, 640, 1080 ve 1600 px genişlikte, özgünden küçük olan WebP kopyaları üretir (`src/variants.mjs`). Kopyalar `/media/:id?w=` ile, özgünle aynı erişim kontrolünden geçerek verilir. `uiPic()` `srcset`, `sizes`, `width` ve `height` yazar; kırpılan görünümler kişinin seçtiği odak noktasını (`object-position`) kullanır, tek fotoğraf görünümü kırpılmaz.
