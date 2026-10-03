# İstemci katmanları: dosyalar arası fonksiyon sarmalayıcıları

Tarayıcı kodu derleyicisiz, sırayla yüklenen klasik betiklerdir (`public/index.html`): `app.js` → `social.js` →
`experience.js` → `feed.js` → `memories.js` → `konak.js` → `ui/*.js`. Sonradan gelen bir dosya, öncekinin bir
fonksiyonunu `x = function () { … eskiX() … }` biçiminde sarabilir. Bu belge hangi sarmalayıcıların kaldığını ve
neden kaldığını kaydeder.

## Ekim 2026 sadeleştirmesi

- Sarmalayıcı sayısı **60 → 47**. Önceki tanımı hiç çağırmadan **tamamen değiştiren** 12 sarmalayıcıda eski
  tanım ölü koddu; silindi ve geçerli sürüm tek bir `function` bildirimi oldu: `archiveProfileExtras`,
  `archiveToday`, `communityChat` (experience.js), `ffBindComposer`, `ffComposerExtra`, `ffTagDraft`, `hmGuide`,
  `hmSummary`, `hmUpload` (konak.js), `photoDetail`, `photoForm` (memories.js), `dmStream` (ui/feed.js). Ayrıca
  memories.js tarafından ezildiği için hiç çalışmayan experience.js `photoDetail` sarmalayıcısı kaldırıldı.
  Toplam 426 satır ölü kod silindi.
- Davranış korunmuştur: 44 tarayıcı testi ve 99 birim/API testi geçti; demo modunda 11 ekran × masaüstü/telefon
  (22 görüntü) değişiklik öncesi ve sonrası **piksel düzeyinde aynı** çıktı.
- `tests/build.test.mjs` iki dosyada aynı üst düzey adın tanımlanmasını engeller; böylece bir dosya diğerinin
  fonksiyonunu fark edilmeden ezemez. Bilinçli genişletme yalnız aşağıdaki sarmalayıcılarla yapılır.

## Kalan sarmalayıcılar ve gerekçesi

Hepsi önceki sürümü çağırır ve üstüne yalnız kendi katmanının işini ekler. Tek dosyada birleştirmek, ilgili
özelliğin kodunu (ör. Konak ana sayfa düzeni, ui/ tasarım katmanı) çekirdek dosyalara taşımak demektir; testlerle
korunmadan yapılacak büyük bir yeniden yazım olacağından bu turda yapılmadı.

| Fonksiyon | Sarmalayan dosya(lar) | Eklediği iş |
| --- | --- | --- |
| `render`, `go`, `readRoute`, `handle` | konak.js, ui/navigation.js, ui/dialogs.js | Konak sayfa düzeni, geri hareketi/geçmiş, diyalog odak yönetimi |
| `HTMLDialogElement.prototype.showModal/close` | ui/navigation.js | Tarayıcının geri tuşu diyaloğu kapatsın diye geçmiş kaydı |
| `modal`, `knNotifications` | ui/dialogs.js | Alt sayfa (sheet) görünümü, bildirim listesinin yeni tasarımı |
| `ffHandle`, `ffApi`, `ffComments`, `ffListMarkup` | memories.js, konak.js, ui/feed.js | Avlu bağlantıları, Konak eylemleri, canlı akış güncellemesi |
| `ffMountProfile`, `exProfile` | memories.js, ui/profile.js, feed.js | Profil sekmesine Avlu ve yeni profil düzeni |
| `photoDetail`, `hmApi`, `hmShowUpload`, `hmTags` | konak.js, ui/avlu.js | Konak yorumları, kırpma odağı, yeni yükleme adımları |
| `archiveOpen`, `eventDetail`, `window.archiveApp.bind` | experience.js, konak.js | "Kimler görebilir?" ve takvim hatırlatma düğmeleri |
| `communityChat`, `dmHost`, `dmThreads`, `dmOpen`, `dmLoad`, `dmSend`, `dmLists`, `dmContext`, `dmPosition`, `dmRecord` | konak.js, ui/core.js, ui/messages.js | Mesajlaşmanın yeni tasarımı: ses dalga biçimi, başarısız gönderimi koruma, konum |
| `window.familyEnhancements.bind/cleanup` | experience.js, feed.js, memories.js, konak.js | Her katmanın sayfa değişiminde kendi dinleyicilerini kurup kaldırması (bilinçli olay zinciri) |

Yeni kodda tercih: yeni davranış için yeni bir fonksiyon yazıp çağıran yerden doğrudan çağırmak; sarmalayıcı
yalnız var olan bir akışa bir katmanın işini eklemek gerekiyorsa ve bu tabloya eklenerek kullanılır.
