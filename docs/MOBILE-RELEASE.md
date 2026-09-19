# iOS ve Android yayın hazırlığı

Kaynak proje hazır; mağazaya yüklenmiş uygulama, imzalı IPA/AAB veya onaylanmış sürüm değildir.

## Mimari

- Capacitor ile `ios/` Xcode ve `android/` Gradle projeleri oluşturuldu.
- Ortak Türkçe arayüz, hesaplar, D1 veritabanı ve R2 arşivi web ile aynıdır. Kopya mobil veritabanı yoktur.
- Mevcut mobil yapılandırma kontrollü HTTPS Site adresini yükler. Bu bir uzaktaki web arayüzünü yerel konum ve cihaz hatırlatmalarıyla kullanan mobil istemcidir; ayrı SwiftUI/Compose ekranları yazılmadı.
- Kaynak `capacitor.config.json` içindeki tek alan adına sınırlandırılmıştır. Açık HTTP ve karışık içerik kapalıdır. Herhangi bir giriş atlatma anahtarı uygulamaya konmaz.
- Konum paylaşımı varsayılan kapalıdır. Kullanıcı 1/8/24 saat, yaklaşık/kesin konum ve ayrıca arka plan seçimini kendisi yapar. Android kalıcı bildirimi ve işletim sistemi izinleri gerekir.
- Sunucu yalnızca son konumu saklar; yaklaşık konumu sunucuda yuvarlar, süre dolunca gizler ve sonraki konum sorgusunda siler. Paylaşımı durdurmak kaydı siler; eski cihaz gönderimleri paylaşım anahtarıyla reddedilir.
- Arka plan ağ çağrıları CapacitorHttp üzerinden gider. SIWC/WebView ve native HTTP cookie paylaşımı gerçek iOS/Android cihazlarda doğrulanmalıdır. Google/Apple ile girişin gömülü tarayıcı kısıtları ve yönlendirmeleri mağaza yayınından önce çözülmelidir.
- Uygulama zorla kapatıldığında, izin kaldırıldığında veya işletim sistemi durdurduğunda takip garantisi yoktur. Yerel testler bu durumları doğrulamaz.
- Web sohbeti SSE olay akışına geçirildi; Node aynı süreçte anlık uyarım, Worker örnekleri arasında 5 saniyelik DB kontrolü var. Native istemcide mesajlaşma görünür ekranda 4 saniyede, harita 15 saniyede, diğer paylaşılan ekranlar 20 saniyede yenilenir. Bu WebSocket tabanlı anlık yayın değildir. Görünmeyen sekmeler sorgulamayı durdurur.
- Cihaz hatırlatmaları yerel bildirimdir. Tarayıcı/PWA için genel Web Push bildirimi eklendi; gerçek telefona teslimat henüz doğrulanmadı. Native APNs/FCM mağaza yapılandırması hâlâ yoktur.

## Geliştirme

```sh
npm ci
npm test
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

Android: JDK 21, Android SDK ve Android Studio gerekir. iOS: macOS ve Xcode gerekir. `Mobile build checks` GitHub Actions iş akışı debug Android APK ve imzasız iOS simülatör derlemesini kontrol eder; mağazaya otomatik yüklemez. `mobile/render-icons.py` yalnızca ikonları yeniden üretmek için CairoSVG ve Pillow kullanır, normal derleme bunlara ihtiyaç duymaz.

## Yayın öncesi kalan somut kapılar

1. Apple Developer / App Store Connect ve Google Play Console hesapları; takım kimliği, bundle/package adı sahipliği, imzalama sertifikaları ve Android yükleme anahtarı. Gizli bilgileri repoya koymayın.
2. Native derleme başarıları ve en az bir gerçek iPhone/Android cihazında giriş, fotoğraf seçimi, mesajlar, konum başlat/durdur, ekran kilidi, pil tasarrufu, izin iptali ve hesap silme testi.
3. Aileye dış erişim: şu an Site yalnızca sahibine açıktır. İncelemeci ve gerçek üyeler için platform erişimi ayrıca verilmelidir. Uygulama daveti platform izinlerini açmaz.
4. Mağaza için kamuya açık gizlilik/destek ve hesap silme talebi sayfası; gerçek veri sorumlusu adı ve iletişim adresi. `PRIVACY-DRAFT.md` doldurulacak taslaktır; tamamlanmış hukuki metin değildir.
5. Play konum bildirimi, Data Safety, App Privacy, yaş derecelendirmesi ve kullanıcı içeriği moderasyon beyanları; gerçek veri kullanımıyla eşleşmeli.
6. Gerçek uygulama ekran görüntüleri, fiziksel cihazdan arka plan konum izin akışını gösteren video, test hesabı ve inceleme notları.
7. Kurucu hesabı için yönetim devri / kapatma süreci: sıradan üyeler uygulama içinden hesaplarını silebilir, kurucu için devir gereklidir.
8. Site URL'sini özel alan adına taşıma kararı ve erişim/giriş mimarisinin mağaza incelemesine uygunluğu. Mevcut uzaktan arayüz yükleme yapılandırması mağaza onayı garantisi değildir.

## Resmî dayanaklar

- [Apple inceleme kuralları](https://developer.apple.com/app-store/review/guidelines/): işlevsellik, inceleme erişimi, kullanıcı içeriği ve hesap silme.
- [Google Play arka plan konumu](https://support.google.com/googleplay/android-developer/answer/9799150): belirgin açıklama, izin ve inceleme gereksinimleri.
- [Konum eklentisi](https://github.com/capacitor-community/background-geolocation): izinler, Android kalıcı bildirim ve native ağ çağrıları.
- [Natural Earth dünya verileri](https://github.com/topojson/world-atlas): ülke ve kıyı sınırları uygulamaya gömülüdür; harita karo servisi kullanılmaz. Bu bir sokak/navigasyon haritası değildir.
