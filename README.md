# Sarıçiçek Family

Özel aile arşivi: soy ağacı, kişiler, fotoğraf albümü, aile takvimi, hikâyeler ve rol tabanlı moderasyon.

## Eklenen ortak özellikler

- İstenen bölüm adları: Aile Konağı, Avlu, Soy Ağacı (Antep fıstığı ağacı simgesi), Geçmişten Günümüze, Bizimkiler Nerede?
- Gerçek dünya haritası, gruplanan pinler, isim arama, ayrı ikamet ve izinli canlı konumlar. Canlı konumun güncelleme zamanı görünür.
- Birebir sohbet, okunmamış mesajlar, engelleme ve seçilen mesajı şikâyet etme. Moderatör yalnızca bildirilen mesajları inceleyebilir.
- PDF belgeleri için Aile Sandığı, moderasyon ve özel indirme.
- Buluşmalara katılım yanıtları; soy ağacını tarayıcıdan PDF/yazdırma; mobil yerel takvim hatırlatmaları.
- `ios/` ve `android/` native projeleri, Türkçe izin açıklamaları, uygulama simgeleri ve GitHub derleme iş akışları.

Mağaza yayını tamamlanmadı. Mobil istemci aynı HTTPS web arayüzünü yerel cihaz özellikleriyle kullanır; gerçek cihaz giriş/arka plan testleri ve imzalama gerekir. Ayrıntılar: [Mobil yayın durumu](docs/MOBILE-RELEASE.md).

## Canlı sürüm (Sites)

Canlı sunucu `worker/index.mjs` üzerinden çalışır. Kayıtlar D1, fotoğraflar özel R2 deposunda tutulur. Tarayıcı belleği gerçek aile verilerinin kaynağı değildir. `?demo=1` yalnızca açıkça ayrılmış örnek arayüzdür.

Sites girişinde ChatGPT kimliği kullanılır. İlk kurucu hesabı, çalışma ortamında gizli tutulan `OWNER_EMAIL` ile eşleştirilir; sonraki erişimler Site'ye özel sabit kimlikle kontrol edilir. Yeni üyeler e-posta adreslerine bağlı tek kullanımlık davet ile katılır. Site'nin erişim listesi ayrıca geçerlidir: uygulamadaki davet tek başına platform erişim izni vermez. Şimdiki yayın yalnızca sahibine açıktır.

`CSRF_SECRET` ve `OWNER_EMAIL` Sites ortam değişkenleridir; kaynak koduna yazılmaz. Şema `db/schema.ts`, Drizzle tarafından üretilen değişiklikler `drizzle/` altındadır. Uygulanmış migration dosyaları değiştirilmez.

```sh
npm ci
npm test
npm run build
```

Test komutu hem gerçek Node sunucusunu hem de Worker'ın SQLite/R2 adaptörleriyle yerel yetki ve kayıt akışlarını doğrular. Yerel yük testi 1.202 kişi ve 50 eşzamanlı okumayı kapsar; 1.000 eşzamanlı kullanıcı kapasitesi doğrulanmış değildir.

Özel alan adı satın alımı, DNS ve alan adına bağlı e-posta kutuları henüz bağlı değildir. Ayarlardaki alan adı planlaması posta hizmeti oluşturmaz. Kaynak hedefi: `keremsaricicek/saricicektree`.

## Bağımsız sunucu sürümü

 · Aile Konağı

Davetle katılınan, yönetici / moderatör / aile üyesi rollerine sahip özel aile arşivi. Türkçe arayüz; telefon ve masaüstü için baştan tasarlanmıştır.

## Çalıştırma

Node.js 24+ gereklidir. Uygulamanın çalışma zamanı için üçüncü taraf npm bağımlılığı yoktur.

```sh
npm run demo
# http://localhost:3000 — yalnızca örnek veriler; tarayıcıda saklanır
```

Gerçek çok kullanıcılı sunucu:

```sh
# ADMIN_EMAIL, ADMIN_NAME ve güçlü ADMIN_PASSWORD ortam değişkenlerini güvenli şekilde ayarlayın.
npm run admin
# ADMIN_PASSWORD ortam değişkenini kaldırın.
npm start
```

Yönetici hesabı yokken açık kayıt veya varsayılan yönetici şifresi bulunmaz. İlk hesap CLI ile kurulur. Sonraki kullanıcılar yalnızca yönetici davetiyle katılır. `DEMO_MODE=1` ve `?demo=1` gerçek verileri açmaz; birbirinden ayrı örnek verili önizlemeyi açar.

## İçerik

- Yeni görsel sistem: kırık beyaz, zeytin yeşili, ölçülü altın; serif başlıklar, tek tip Lucide ikonlar.
- Ana sayfa, kişi rehberi ve profiller; şehir ve ülkelere göre yaşayan aile üyeleri.
- Ebeveyn, evlat edinme ve eş ilişkileri; döngü engelleme; SVG bağlantıları; yakınlaştırma, sürükleme, arama ve aile dalına odaklanma.
- Fotoğraf seçme / sürükleme, görsel önizleme, tarih, yer, kişi etiketleri, açıklama, düzenleme, indirme.
- Doğum günü, evlilik yıldönümü, anma, cenaze, buluşma, göç ve aile hikâyeleri; takvim ve ICS indirme.
- Yönetici: davet, rol değiştirme, üyeliği dondurma, şifre yenileme bağlantısı, ayarlar, JSON dışa aktarma.
- Moderatör: kişi / ilişki yönetimi, içerik onayı ve reddi, kaldırılan kayıtları geri alma.
- Üye: aileyi görme, fotoğraf / olay ekleme ve kendi içeriklerini düzenleme. Katkılar onaydan geçer; düzenlenen üye içeriği tekrar onaya döner.
- SQLite WAL kalıcı veri tabanı; fotoğraflar özel dizinde, kimlik doğrulamalı endpoint üzerinden sunulur.
- Scrypt şifre özeti, HttpOnly / SameSite cookie, üretimde Secure, CSRF + Origin kontrolü, giriş / yükleme hız sınırlaması ve işlem kaydı.

## Önemli ayrım

**Önizleme**, etkileşimli tasarımı denemek içindir; verileri sadece tarayıcıda saklar. **Node sunucusu**, ortak veri tabanı ve gerçek üyelik sistemidir. Site önizlemesinin yayımlanmış olması Node sunucusunun üretime kurulduğu anlamına gelmez.

Alan adı satın alma ve gerçek posta kutusu açma tamamlanmış değildir. Ayarlara alan adı yazmak yalnızca planı kaydeder; DNS veya e-posta sağlayıcısında işlem yapmaz. Davet bağlantısı oluşturulur ama otomatik e-posta gönderilmez. Bu sürümde bağlantıyı yönetici kendisi paylaşır.

`docs/DEPLOYMENT.md` kurulum, DNS, e-posta, yedekleme ve kapasite sınırlarını açıklar. `docs/VALIDATION.md` doğrulanan kapsamı listeler.

## Test

```sh
npm test
```

Gerçek HTTP sunucusu ve geçici veri tabanı üzerinde davetler, roller, CSRF, moderasyon, fotoğraflar, geri yükleme, şifre sıfırlama, kalıcılık; 1.202 kişi kaydı ve 50 eşzamanlı okuma testi.

## Dosyalar

- `public/`: arayüz, temsili görseller ve demo adaptörü.
- `src/server.mjs`: gerçek API ve özel fotoğraf sunumu.
- `src/db.mjs`: ilişkisel şema.
- `src/domain.mjs`: tarih ve aile ilişkisi doğrulaması.
- `src/admin.mjs`: ilk yönetici hesabı.
- `src/build-preview.mjs`: yalnızca örnek verili statik önizleme üretir.
- `Dockerfile`, `compose.yaml`, `Caddyfile`: tek sunucuda HTTPS kurulum iskeleti.

Gerçek aile kayıtları örnek veri diye uydurulmamıştır. Önizleme kişileri kurmacadır; görseller yapay zekâyla üretilmiş, temsili olarak etiketlenmiştir. Önceki HTML'de bulunan Yılmaz / Demir örnek kayıtları ve doğrulanmamış ebeveyn bağlantıları gerçek aile veri tabanına aktarılmamıştır.

Lucide ikonları ISC lisanslıdır; lisans `public/assets/LUCIDE-LICENSE` dosyasındadır.
