# Kontrollü stres testi

2026-09-19T12:10:31.302Z

1000 ayrı oturum, 5000 kişi, 5000 arşiv kaydı ve 20000 başlangıç mesajı. Yalnızca yerel, geçici test verisi kullanıldı. Her aşama iki paralel istek dalgasıdır; sürekli 1000 aktif kullanıcı SLA testi değildir.

İş yükü: %20 arama, %20 ana veri yükleme, %20 sohbet okuma, %20 sohbet yazma, %20 okunmamış sayacı.

| Paralel istek | Toplam | Hata | p50 ms | p95 ms | p99 ms | İstek/sn |
|---|---|---|---|---|---|---|
| 100 | 200 | 0 | 421 | 698 | 701 | 150 |
| 250 | 500 | 0 | 870 | 1559 | 1560 | 166 |
| 500 | 1000 | 0 | 1663 | 3033 | 3043 | 164 |
| 1000 | 2000 | 0 | 3139 | 6160 | 6163 | 164 |

SSE ilk bağlantı: 1000/1000; 397 ms. Uzun süreli bağlantı dayanıklılığı ölçülmedi.

SQLite bütünlük: ok; yabancı anahtar hatası: 0.

VmHWM:	  314564 kB; VmRSS:	  302096 kB

Bu sonuç Node/SQLite yerel sürümüne aittir. Hosted D1/R2 ağ gecikmeleri, CDN, gerçek medya yüklemeleri, push servisleri, mobil pil/arka plan davranışı ve dağıtık gerçek kullanıcı yükü bu testin kapsamı dışındadır.
