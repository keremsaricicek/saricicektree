# Üretim kurulumu

## 1. Alan adı ve sunucu

Bu repo satın alma yapmaz. Seçilecek alan adının sahipliği ve barındırma hesabı gereklidir. Alan adının A/AAAA kayıtlarını sunucunuza yönlendirin. Sunucuda Docker Compose ve 80/443 portları hazır olsun.

`.env.example` dosyasını `.env` olarak kopyalayın ve `SITE_DOMAIN` değerini gerçek alan adı yapın. Ardından:

```sh
docker compose up -d --build
```

Caddy, erişilebilir alan adı için HTTPS sertifikasını yönetir. Uygulama `APP_ORIGIN` üzerinden tam origin eşleştirmesi yapar. Farklı alt alan adlarından POST kabul edilmez.

İlk yönetici için ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD değişkenlerini kendi terminalinizde güvenli olarak ayarlayın; bunları git'e eklemeyin veya sohbetten paylaşmayın:

```sh
docker compose exec -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD app node src/admin.mjs
```

Oluşturduktan sonra şifre ortam değişkenini kaldırın. Kurucu varsa komut tekrar hesap açmaz. Güçlü şifre ve hesap güvenliği aile yöneticisinin sorumluluğundadır. TOTP iki aşamalı giriş profil/güvenlik ekranından açılabilir. Kurulum anahtarını güvenli saklayın; 10 tek kullanımlık kurtarma kodu oluşturulur. Node için SECURITY_KEY sabit bir gizli değer olmalıdır; verilmezse yerel veri tabanında oluşturulur. Bu anahtarı değiştirmek kayıtlı TOTP sırlarını okunamaz yapar.

## 2. E-posta alan adı

Site üyeliği ile gerçek e-posta kutusu farklı hizmetlerdir. Seçilecek posta sağlayıcısında alan adı doğrulanmalı, sağlayıcının verdiği MX / SPF / DKIM / DMARC kayıtları uygulanmalı ve istenen kişiler için kutular açılmalıdır. DNS değerlerini tahmin etmeyin; seçilen sağlayıcının yönetim ekranındaki değerleri kullanın.

Sitede alan adını ayarlayın. Yönetici panelinden e-posta adresine bağlı bir davet üretin. Bu sürüm otomatik e-posta göndermez. Davet URL'si 7 gün ve tek kullanım içindir; şifre yenileme URL'si 1 saat ve tek kullanım içindir. Linkler yalnızca amaçlanan kişiye iletilmelidir. Tam e-posta kutusu lisansları ile yalnızca yönlendirme adresleri aynı şey değildir; satın almadan önce hangisine ihtiyaç olduğunu belirleyin.

## 3. Veri koruma ve yedekleme

`family_data` volume'u veri tabanını ve fotoğrafları tutar. Container silmek kalıcı volume'u silmemelidir. `docker compose down -v` veri kaybına neden olur; kullanmayın.

Tutarlı yedek için uygulamayı kısa süre durdurun, `family_data` volume'unun tamamını şifreli yedekleyin, tekrar başlatın. Alternatif olarak SQLite backup API ile canlı veri tabanı yedeği ve koordineli upload dizini yedeği alın. Her gece yedekleme ve düzenli geri yükleme denemesi planlayın. Site içindeki JSON dışa aktarma **tek başına tam yedek değildir**: fotoğraf dosyalarını, şifre özetlerini ve oturumları içermez.

Medya özel endpoint üzerinden sunulur. Üye sayısı ve aile bağları yalnızca giriş yapanlar tarafından görülür. Fotoğraf ve arşiv katkıları yalnızca sahibi görecek şekilde özel tutulabilir. Veli koruması etiketli fotoğrafları ve bağlı arşiv kayıtlarını sınırlar; temel profil, bağlar, olaylar ve ikamet diğer üyelerden saklanır; veli ve yönetici görebilir. Grup sohbetleri yalnızca grup üyelerine açıktır. Tarih / konum paylaşırken aile üyelerinin rızasıyla kayıt tutun.

## 4. Kapasite

1.000+ kayıtlı aile üyesi hedefi için tek Node 24 sunucusu, SQLite WAL ve özel disk deposuyla başlanabilir. Bu sürüm 1.202 kişi kaydı ve 50 paralel okuma isteğiyle test edilmiştir. **1.000 eşzamanlı kullanıcı garantisi verilmez.** Gerçek sunucuda veri hacmi ve fotoğraf indirme trafiğiyle yük testi yapılmalıdır.

Kişi listesi sayfalanır; büyük ağaçta tek seferde en fazla 120 kart gösterilir ve kişi aramasıyla ilgili dala odaklanılır. Aile kayıtları bootstrap ile topluca gelir; profil biyografileri çok büyürse sunucu tarafında sorgu/sayfalama eklenmelidir. Fotoğraf arşivi kademeli yüklenir. Başlangıç etkinlik penceresi 1.000 olaydır.

Disk kapasitesini izleyin. Kişi başına 100 fotoğraf yüklenirse depolama büyür. Fotoğraflar tarayıcıda 2.400 piksele küçültülerek JPEG'e dönüştürülür, EXIF konum verisi taşınmaz; orijinalin birebir arşiv kopyası tutulmaz. API 8 MB üst sınır, resim imza kontrolü ve SVG reddi uygular. Kapsamlı antivirüs / görüntü yeniden kodlama hattı henüz yoktur.

Proxy arkasında hız sınırlaması güvenli varsayılan olarak bağlantı IP'sini kullanır; aynı proxy IP'si tüm girişleri kapsayabilir. Büyük dağıtımda yalnızca güvendiğiniz proxy için gerçek istemci IP'si aktarımını ve rate-limit politikasını yapılandırın; keyfi X-Forwarded-For'a güvenmeyin.

Daha yüksek trafik için PostgreSQL, obje depolama, thumbnail üretimi, queue tabanlı e-posta, merkezi hız sınırlaması ve gözlemleme sonraki üretim iyileştirmeleridir.

## 5. Yayından önce

- Sahip olunan alan adı, HTTPS ve APP_ORIGIN doğrulansın.
- Yönetici ve ayrı üye hesabıyla canlı ortamda uçtan uca denensin.
- Gerçek kullanıcı davetleri ve posta kutuları sağlayıcıda hazırlansın.
- Yedek / geri yükleme denensin, disk uyarıları kurulsun.
- Örnek önizleme bağlantısıyla gerçek üretim adresi karıştırılmasın.
- İhtiyaç varsa aileye özel gizlilik metni ve açık paylaşım kuralları hazırlansın.

## 6. Yaşayan arşiv yapılandırması

0002 ve 0003 migration dosyaları yeni arşiv ve güvenlik tablolarını ekler. Uygulanmış dosyaları değiştirmeyin. Node sürümünde UTC 02:00 sonrası bağımsız günlük zamanlayıcı vardır. Sites'ta yönetici ziyaretine bağlı işlem sürer; mevcut barındırmaya ayrı cron bağlanmadı. Yedek ekranı eksik kayıtları geri ekler, mevcut kayıtların üstüne yazmaz. Yeni sürüm 3 yedekleri medya dosyalarının ayrı kopyalarını ve bütünlük özetlerini içerir. Kullanıcı hesaplarını ve sohbetleri içermez; tam veri deposu ve ayrı depoya felaket yedeği ayrıca gerekir.

Fotoğraf iyileştirme isteğe bağlıdır: OPENAI_API_KEY gizli ortam değeri ve IMAGE_MODEL (varsayılan gpt-image-1.5) yapılandırılmadan devre dışıdır. Sites için OpenAI Developers bağlantısı üzerinden anahtar kurulumu gerekir. Kullanıcı fotoğrafın harici hizmete gönderilmesini işlem sırasında onaylar. Oluşan kopya açıkça etiketlenir; özgün fotoğraf silinmez. Gerçek servis testi anahtar sağlanmadığı için yapılmadı. API: https://developers.openai.com/api/reference/resources/images/methods/edit

Site şu anda sahibine özeldir. Akrabaların erişimi için Sites erişim listesi ayrıca düzenlenmeli veya bağımsız sunucu kendi alan adında kurulmalıdır. Uygulama daveti platform erişimini kendiliğinden açmaz.
