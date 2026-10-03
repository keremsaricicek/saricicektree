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

## Büyük soy ağacı: yalnız görüneni çizmek (Ekim 2026)

Ölçüm: `node scripts/measure-render.mjs` (1.200 kişi, 390×844, CPU 4× yavaşlatma, aynı makinede 3 tekrarın ortancası).

| Ölçü | Önce | Sonra |
| --- | --- | --- |
| Soy ağacına geçiş | 517 ms | 184 ms |
| Ağacın açılışı (iki kare) | 371 ms | 89 ms |
| Ağaçtaki DOM öğesi | 8.408 | 232 |
| 20 adım kaydırma | 1.013 ms | 720 ms |
| JS yığını (çöp toplama sonrası) | 3,2 MB | 3,1 MB |
| "Ekrana sığdır": sayfa yanıt veriyor | 70 ms | ~170 ms |
| "Ekrana sığdır": 1.200 kartın tamamı | 70 ms (zaten çizili) | ~1,9 s (kare kare) |

- 120 kişiye kadar her şey eskisi gibi çizilir. Daha büyük ağaçta yerleşim, bağlar ve mini harita tüm kişileri
  içerir; kartlar yalnız görünen alanın çevresinde (480 px pay) sayfadadır, kaydırma ve yakınlaştırmayla eklenip
  çıkarılır. Çok uzaklaşınca kartlar ortadan dışa doğru, kare başına 150 tane eklenir; sayfa bu sırada yanıt verir.
- Bağlar türüne göre tek bir SVG yolu olarak çizilir (1.199 öğe yerine 1–4).
- Arama/odak, yakınlaştırma, sığdırma ve yazdırma çalışır (`tests/e2e/tree-large.spec.mjs`, 600 kişi). Yazdırmada
  tüm kartlar çizilir.
- Ekran okuyucu notu: büyük ağaçta yalnız görünen bölümdeki kişiler okunur; ağaç alanının etiketi bunu ve aramayı söyler.
- Görünüm: demo ağacında (küçük) tek fark, iki çocuğa inen ortak gövde çizgisinin kenar yumuşatması (telefon
  görüntüsünde 209 piksel, %0,05): eskiden iki ayrı çizgi üst üste çiziliyordu, şimdi bir kez çiziliyor. Diğer 21
  demo ekranı piksel düzeyinde aynı.
- Bedeli: tüm ağacı bir anda görmek ("Ekrana sığdır") artık kartları kademeli getirir.

## Dünya haritası: hafif çizim, yakınlaşınca tam ayrıntı (Ekim 2026)

Ölçüm: `node scripts/measure-load.mjs 5` (yukarıdaki koşullar; 5 tekrarın ortancası).

| Ölçü (Bizimkiler Nerede?) | Önce | Sonra |
| --- | --- | --- |
| Harita hazır | 2.521 ms | 1.968 ms |
| 10 kaydırma + yakınlaş/uzaklaş | 747 ms | 507 ms |
| JS yığını | 40 MB | 20,5 MB |
| Haritanın ülke dosyası (ilk açılış) | 756 KB ham / 237 KB gzip | 269 KB ham / 78 KB gzip |
| İlk açılıştaki tüm JS | 1.308 KB / 421 KB gzip | 833 KB / 268 KB gzip |
| Yakınlaşınca tam ayrıntı | — (hep yüklü) | +758 KB ham / 237 KB gzip, 793 ms |

- İlk çizim, Natural Earth 1:50m setinin 241 ülkesinin tamamını içerir; dünya görünümünde bir ekran pikselinden
  küçük köşeler derleme sırasında atılır (`topojson-simplify`, ağırlık 0,01 derece²). Zoom 4 ve üstünde tam 1:50m
  çizim yüklenir ve yerine geçer; yüklenemezse hafif çizim kalır, sonraki yakınlaştırmada yeniden denenir
  (`tests/e2e/map.spec.mjs`).
- Görünüm: zoom 4, 5 ve 7'de önce/sonra piksel düzeyinde aynı. Dünya görünümünde (zoom 3) sınır çizgileri en fazla
  bir piksel kayar (görüntünün %3,3'ü); ülkeler, adalar ve kıyılar yerinde.
- Bedeli: yakınlaştıran kişi toplamda 269 KB fazla indirir.
- Tek dosyalık dışa aktarım iki çizimi de içinde taşır; çevrimdışı tam ayrıntı çalışır.

## Kalanlar

- **CSS.** 211 KB ham, 43 KB gzip; kullanılmayan kural temizliği yapılmadı.
- **Gerçek cihaz.** Ölçümler Chromium öykünmesidir; gerçek telefonda ölçülmedi.
- Büyük ağaç testi bir **tarayıcı** ölçümüdür; eşzamanlı kullanıcı kapasitesi değildir (kapasite: STRESS-RESULTS.md).
