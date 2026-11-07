# Ortak Nokta (commonpoint)

İstanbul (Avrupa ve Anadolu yakası) ve Bursa için: istediğin kadar adres ekle, toplu taşıma ağında herkes için adil bir buluşma koordinatı bulsun.

Şehir sayfadaki anahtardan seçilir. Doğrudan bağlantılar: `#istanbul` ve `#bursa`.

- Metro, Marmaray, Bursaray, tramvay, füniküler, vapur ve metrobüs hatları OpenStreetMap'ten (Overpass) indirilir.
- Her kişiden Dijkstra algoritması çalışır: yürüyüş veya otobüsle bir durağa erişim, sonra hatlar üzerinde aktarmalı en kısa süre.
- Tek ölçüt: herkesin en uzun yolculuğu en kısa olan durak seçilir (minimax). Toplam süre hedeflenmez.
- Sonuç mekan değil koordinattır. Araç yoktur, Avrasya Tüneli kullanılmaz.

Tek dosyalı statik uygulamadır (`index.html`, Leaflet gömülü). Sunucu gerekmez.

Süreler tahmindir (Bursa'da ana ulaşım otobüs olduğu için Bursaray ve tramvay hattından uzak bölgelerde daha kaba): otobüs ve minibüs ortalama hızla hesaplanır, sefer saatleri ve gerçek bekleme süreleri dikkate alınmaz.

Veri: © OpenStreetMap katkıcıları. Adres arama: Nominatim.

## Tasarım

Arayüz renk teorisi ve UX yasalarına göre yeniden tasarlandı.

- Harita tam ekran, panel üstünde yüzer. Mobilde panel alttan açılan bir sayfadır (bottom sheet).
- Tek vurgu rengi turkuaz (%10). Renk yalnızca veride anlam taşır: mavi Avrupa, turuncu Anadolu. Buluşma noktası renkle değil şekil ve boyutla ayrışır.
- Metin kontrastı WCAG 4.5:1, işaretler 3:1 üzerindedir. Açık ve koyu tema ayrı seçilmiş değerlerdir, sistem temasını izler.
- Her yolculuk satırında süre çubuğu vardır, en uzun yolculuk işaretlidir. Renk dışında etiket, desen ve sayı da kullanılır.
- Harita zemini varsayılan olarak OpenStreetMap Standart karolarıdır (anahtar gerekmez). Zemin, hat renkleri öne çıksın diye CSS ile soluklaştırılır. Seçenekler içindeki "Harita rengi" kaydırıcısı doygunluğu ayarlar (soluk ↔ özgün renk), seçim tarayıcıda hatırlanır. Karolar yüklenmezse sırayla OSM Fransa, Esri ve OSM Almanya denenir.
- Seçenekler ve açıklama varsayılan olarak kapalıdır. Adres kutusu adres, koordinat ve Google Haritalar bağlantısını kabul eder.

## Hat verisi

Uygulama hat verisini gömülü taşır: `index.html` içindeki `<script id="ortak-data">` bloğu. Açılışta hiçbir şey indirilmez. Gömülü veri yoksa uygulama raylı hatları canlı Overpass'tan indirir ve otobüsü ortalama hızla hesaplar.

Veriyi yenilemek için (Node 18 veya üstü, ek paket gerekmez):

```
node tools/build-data.mjs
```

- OpenStreetMap'ten metro, Marmaray, tramvay, füniküler, vapur, Metrobüs ve İstanbul için tüm otobüs hatlarını indirir. İstanbul'da yaklaşık 1700 otobüs hattı olduğu için birkaç dakika sürebilir.
- `data/istanbul.json` ve `data/bursa.json` dosyalarını yazar ve `index.html` içine gömer. Sonra commit edip pushlaman yeterli.
- Bursa'da OpenStreetMap'te yalnızca 17 otobüs hattı var, eksik ağ sonucu bozacağı için otobüs alınmaz. Orada otobüs ortalama hızla hesaplanır.
- Overpass kimliksiz istekleri reddeder (HTTP 406), betik bu yüzden `ortak-nokta-data/1.0` User-Agent'ı gönderir. Başka bir ad vermek için `OVERPASS_UA="adın (iletişim)" node tools/build-data.mjs`. HTTP 429 sunucunun yoğun olduğu anlamına gelir, betik bekleyip yeniden dener.
- Seçenekler: `--city istanbul`, `--embed-only` (indirme yok, `data/` dosyalarını gömer), `--html <dosya>`.

Yakın duraklar tek aktarma noktasında birleşir. Bir aktarma noktası raylı durakları için en çok 750 m, otobüs durakları katılınca en çok 450 m yayılabilir, böylece zincirleme birleşme yürüme süresini gizlemez. Nokta, varsa raylı istasyonun adıyla anılır.

Gerçek otobüs ağı varken kişi yalnızca yürüyerek (en çok 1,5 km) bir durağa gider. Otobüs yaklaşık 15 km/s ortalama hız ve 7 dakika bekleme ile hesaplanır. Yakında hiç durak yoksa eski ortalama hızlı otobüs varsayımı yedek olarak kullanılır.
