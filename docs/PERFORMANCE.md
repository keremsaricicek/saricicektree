# Hız ölçümü (önce / sonra)

Ölçüm: `node scripts/measure-load.mjs 5` — ham veriler `docs/PERF-RESULTS.json`.

Koşullar (iki ölçümde de aynı):
- Node sunucusu, geçici test verisi, test yöneticisiyle girişli.
- 390×844 ekran, boş önbellek, Chromium DevTools ağ öykünmesi 10 Mbit/s ve 40 ms, CPU 4× yavaşlatma.
- 5 deneme; her değer ortanca (medyan).

Bu bir öykünmedir, gerçek telefon ölçümü değildir. "gzip" sütunu, sunucunun gönderdiği dosyaların gzip seviye 6 ile sıkıştırılmış boyutudur. Canlıdaki Caddy sıkıştırması (zstd/gzip) biraz farklı sonuç verebilir.

"Önce" = commit `ad76b00`. "Sonra" = ikon alt kümesi, haritanın gerektiğinde yüklenmesi ve küçültülmüş betikler.

## Hayat (girişten sonraki ilk sayfa)

| Ölçü | Önce | Sonra |
| --- | --- | --- |
| İlk içerik boyası (FCP) | 1092 ms | 828 ms |
| DOMContentLoaded | 2141 ms | 868 ms |
| Uygulama hazır (`#main` görünür) | 2703 ms | 1488 ms |
| Betik çalışma süresi | 238 ms | 32 ms |
| JS yığını | 14,5 MB | 2,8 MB |
| JavaScript ham / gzip | 1738 KB / 514 KB | 408 KB / 143 KB |
| CSS ham / gzip | 207 KB / 42 KB | 207 KB / 42 KB |
| Toplam ham / gzip | 2286 KB / 896 KB | 956 KB / 524 KB |
| İstek sayısı | 34 | 32 |

## Bizimkiler Nerede? (harita dahil)

| Ölçü | Önce | Sonra |
| --- | --- | --- |
| FCP | 1084 ms | 840 ms |
| Harita çizildi | 3238 ms | 2742 ms |
| JavaScript ham / gzip | 1738 KB / 514 KB | 1290 KB / 412 KB |
| Toplam ham / gzip | 2286 KB / 896 KB | 1838 KB / 794 KB |

Toplam boyutlara yazı tipleri ve görseller de dahildir.

## Yapılanlar

- **İkon alt kümesi.** `lucide.min.js` 397 KB'tan 37 KB'a indi. Artık yalnız uygulama kaynağında adı geçen 194 ikon var. `src/build-client.mjs` bu listeyi her derlemede kaynaktan yeniden çıkarır.
  - Eksik ikon denetimi: `tests/e2e/rendering.spec.mjs` her sayfada dönüştürülmemiş `<i data-lucide>` kalmadığını doğrular.
- **Harita gerektiğinde yüklenir.** Leaflet ve dünya sınırları (yaklaşık 0,9 MB) yalnız harita ekranlarında indirilir: Bizimkiler Nerede?, göç haritası, güzergâh seçici.
  - İndirme başarısız olursa ekranda yazar; sonraki ziyarette yeniden denenir (`tests/e2e/map.spec.mjs`).
  - Tek dosyalık dışa aktarım bu dosyaları içinde taşır, çevrimdışı çalışır.
- **Küçültülmüş betikler.** Uygulama betikleri tek tek küçültülüp `public/min/` altına yazılır; klasik betik olarak kalırlar.
  - Tarayıcı testleri bu dosyalarla çalışır.
  - `npm run dev` ise düzenlenebilir kaynakları sunar.
- **Görünüm aynı kaldı.** Değişiklikten önce ve sonra alınan 44 demo ekranı (`scripts/visual-snapshot.mjs`) bayt bayt aynıdır.

## Büyük aile ile yeniden çizim (1.200 kişi, 400 paylaşım)

Ölçüm: `node scripts/measure-render.mjs`. Koşullar: 390×844 ekran, CPU 4× yavaşlatma. "Sayfa çizimi", tüm sayfanın `render()` ile yeniden kurulmasıdır.

| Durum | Önce | Sonra |
| --- | --- | --- |
| Soy ağacı ziyareti | 2 çizim | 1 çizim |
| Kişi aramasına 7 harf yazma | 7 çizim, 801 ms | 1 çizim, 64 ms |
| Canlı beğeni ve yeni kişi gelirken Hayat | 0 çizim, kaydırma korunur | aynı |

- **Soy ağacı:** portre listesi ilk yüklendiğinde boş olsa bile ağaç ikinci kez çiziliyordu. Artık yalnız portreler gerçekten değişince çiziliyor.
- **Kişi araması:** her tuşta tüm sayfa (arama kutusu dahil) yeniden kuruluyordu. Artık yazma durunca, 150 ms sonra bir kez kuruluyor. İmleç ve odak korunuyor.
- İkisi de tarayıcı testiyle korunuyor (`tests/e2e/rendering.spec.mjs`). Testler eski kodda başarısız oluyor (6 ve 2 çizim).
- **Sayfa geçişleri (sonra):**

  | Sayfa | Süre | DOM öğesi |
  | --- | --- | --- |
  | Soy ağacı | 757 ms | 8.633 |
  | Aile üyeleri | 131 ms | 403 |
  | Avlu | 46 ms | 212 |
  | Hayat | 230 ms | 1.447 |

## Kalanlar

- **Soy ağacı.** 1.200 kişiyi tek seferde çiziyor (8.633 DOM öğesi; CPU 4× yavaşlatmayla 757 ms). Yalnız görünen bölümü çizmek (sanallaştırma) daha büyük bir değişiklik; bu turda yapılmadı.
- **Dünya haritası.** `world-map.js` tek başına 755 KB'tır (Natural Earth 1:50m sınırları). Daha kaba 1:110m sınırlar dosyayı belirgin biçimde küçültür, ama yakınlaştırınca haritanın görünüşü değişir. Tasarım kararı gerektirdiği için yapılmadı.
- **CSS.** 207 KB ham, 42 KB gzip; kullanılmayan kural temizliği yapılmadı.
