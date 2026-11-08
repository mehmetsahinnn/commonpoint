# Ortak Nokta (commonpoint)

İstanbul (Avrupa ve Anadolu yakası) ve Bursa için: istediğin kadar adres ekle, toplu taşıma ağında herkes için adil bir buluşma koordinatı bulsun.

Şehir sayfadaki anahtardan seçilir. Doğrudan bağlantılar: `#istanbul` ve `#bursa`.

- Metro, Marmaray, Bursaray, tramvay, füniküler, vapur ve metrobüs hatları OpenStreetMap'ten (Overpass) indirilir.
- Her kişiden Dijkstra algoritması çalışır: yürüyüş veya otobüsle bir durağa erişim, sonra hatlar üzerinde aktarmalı en kısa süre.
- Tek ölçüt: herkesin en uzun yolculuğu en kısa olan durak seçilir (minimax). Toplam süre hedeflenmez.
- Sonuç mekan değil koordinattır. Araç yoktur, Avrasya Tüneli kullanılmaz.
- Sonuçta her kişi ayrı bir kart olarak listelenir (süre çubuğu, en uzun yolculuk işareti, aktarma sayısı). Karta tıklayınca tüm adımlar açılır: yürüyüş, her biniş, aktarma ve iniş. Her hat bacağı farklı bir renkle gösterilir; aynı renk süre çubuğunda, adım listesindeki numarada ve haritadaki çizgide kullanılır (6 renklik, açık ve koyu temada ayrı doğrulanmış palet). Renk tek başına taşıyıcı değildir, adımlar numaralı ve hat adı etiketlidir. Aynı anda tek kart açıktır; açılınca harita o kişinin rotasına odaklanır, diğer kişilerin rotaları soluk çizilir. Kartı yeniden tıklayınca ya da "Adımları gizle" düğmesiyle kapanır ve tüm rotalar yeniden tam çizilir.
- Açık kartta "Rota seç" vardır: aynı buluşma noktasına başka bir otobüs ya da raylı hatla gitmenin alternatifleri süre farkıyla listelenir. Seçilen rota haritada çizilir, kişinin süresi ve en uzun yolculuk işareti buna göre güncellenir. Seçim yalnızca o kişinin gösterilen rotasını değiştirir, buluşma noktası aynı kalır.
- Raylı ağın soluk taban çizgisi de gömülü yol verisi varsa gerçek güzergâhla çizilir, yoksa duraktan durağa düz çizgidir.
- Buluşma yeri belliyse "Buluşma yeri" kutusuna mekan, adres, koordinat ya da Haritalar bağlantısı yazılır (ya da haritadan seçilir). Bu durumda nokta aranmaz, her kişi için o yere güzergah çıkar: yürüyüş ya da otobüsle bir durağa, hatlarla yere en uygun durağa, oradan yürüyerek (yoksa tahmini otobüsle) yere. Yere 1,5 km içindeki kişi doğrudan yürür. Tek kişi de yeter. Sonuçta A seçtiğin yer, B ve C herkes için en adil duraklardır. Yerin en adil duraktan kaç dakika farklı olduğu yazılır. Yer haritada sürüklenebilir, kaldırınca en adil durak aranmaya dönülür.
- Haritada çizilen rotanın her durağı bir noktayla işaretlidir. Noktaya tıklayınca hattın kendi durak adı, hat ve biniş, iniş ya da ara durak bilgisi açılır.

Tek dosyalı statik uygulamadır (`index.html`, Leaflet gömülü). Sunucu gerekmez.

Süreler tahmindir (Bursa'da ana ulaşım otobüs olduğu için Bursaray ve tramvay hattından uzak bölgelerde daha kaba): otobüs ve minibüs ortalama hızla hesaplanır, sefer saatleri ve gerçek bekleme süreleri dikkate alınmaz.

Veri: © OpenStreetMap katkıcıları. Adres arama: Nominatim.

## Tasarım

Arayüz renk teorisi ve UX yasalarına göre yeniden tasarlandı.

- Harita tam ekran, panel üstünde yüzer. Mobilde panel alttan açılan bir sayfadır (bottom sheet).
- Tek vurgu rengi turkuaz (%10). Renk yalnızca veride anlam taşır: mavi Avrupa, turuncu Anadolu. Buluşma noktası renkle değil şekil ve boyutla ayrışır.
- Metin kontrastı WCAG 4.5:1, işaretler 3:1 üzerindedir. Açık ve koyu tema ayrı seçilmiş değerlerdir, sistem temasını izler.
- Her yolculuk satırında süre çubuğu vardır, en uzun yolculuk işaretlidir. Renk dışında etiket, desen ve sayı da kullanılır.
- Harita zemini varsayılan olarak OpenStreetMap Standart karolarıdır (anahtar gerekmez). Zemin, hat renkleri öne çıksın diye CSS ile soluklaştırılır (koyu temada ters çevrilip kısılır). Karolar yüklenmezse sırayla OSM Fransa, Esri ve OSM Almanya denenir.
- Seçenekler ve açıklama varsayılan olarak kapalıdır. Adres kutusu adres, koordinat ve Google Haritalar bağlantısını kabul eder.

## Hat verisi

Uygulama hat verisini gömülü taşır: `index.html` içindeki `<script id="ortak-data">` bloğu. Açılışta hiçbir şey indirilmez. Gömülü veri yoksa uygulama raylı hatları canlı Overpass'tan indirir ve otobüsü ortalama hızla hesaplar.

Veriyi yenilemek için (Node 18 veya üstü, ek paket gerekmez):

```
node tools/build-data.mjs
```

- OpenStreetMap'ten metro, Marmaray, tramvay, füniküler, vapur, Metrobüs ve İstanbul için tüm otobüs hatlarını indirir. İstanbul'da yaklaşık 1700 otobüs hattı olduğu için birkaç dakika sürebilir.
- `data/istanbul.json` ve `data/bursa.json` dosyalarını yazar ve `index.html` içine gömer. Sonra commit edip pushlaman yeterli.
- OpenStreetMap'te İstanbul otobüs hatlarının yaklaşık %79'unda durak üyeleri yolculuk sırasında değil karışık sırada tutuluyor. Betik bu hatların duraklarını aralarındaki toplam yol en kısa olacak şekilde yeniden dizer (raylı hatlara dokunmaz). İndirme yapmadan yalnızca bunu uygulamak için: `node tools/build-data.mjs --reorder`.
- Yolculuklar haritada hattın kendi yol parçaları üzerinde çizilir. Bu yol verisi (`--geom-only` ile indirilir) `index.html` içine gömülüdür, çizim için canlı servis gerekmez. Veri gömülü değilse ya da bir hattın yolu yoksa uygulama sırayla canlı Overpass'tan hat yolunu, sonra OSRM yol servisini dener, o da olmazsa duraklardan geçen kırık çizgi çizer. Çizim süreyi etkilemez.
- Yol verisi: `--geom-only` durak verisine dokunmadan yalnızca yolları indirir (birkaç dakika sürer), `data/*.json` dosyalarına `ways` tablosunu ve her hatta `g` (hangi yol parçalarından oluştuğu) alanını ekler. Yol parçaları hatlar arasında paylaşılır, Douglas-Peucker ile varsayılan 5 m toleransla sadeleştirilir; `--geom-tol 10` dosyayı küçültür. Veride zaten yol varsa `--geom-only` yalnızca yolu olmayan hatları tamamlar (indirme sırasında bazı hatlar sunucu yoğunluğundan atlanabilir, aynı komutu yeniden çalıştırmak yeterli); hepsini baştan indirmek için `--geom-all`. Tam indirmede yollar da iner, atlamak için `--no-geom`. `--reorder` yol verisini korur.
- Overpass sunucusu meşgulse (HTTP 502, 429) betik sırayla öteki sunuculara geçer, hepsi meşgulse bekleyip aynı grubu yeniden dener. Her grup indirilince ilerleme `data/.geom-<şehir>.jsonl` dosyasına yazılır (git'e girmez). Betik kesilirse ya da sunucu uzun süre meşgul kalırsa aynı komutu yeniden çalıştırman yeterli, kalan yerden devam eder. Sık zaman aşımı olursa `--geom-batch 8` ile gruplar küçülür.
- Bursa'da OpenStreetMap'te yalnızca 17 otobüs hattı var, eksik ağ sonucu bozacağı için otobüs alınmaz. Orada otobüs ortalama hızla hesaplanır.
- Overpass kimliksiz istekleri reddeder (HTTP 406), betik bu yüzden `ortak-nokta-data/1.0` User-Agent'ı gönderir. Başka bir ad vermek için `OVERPASS_UA="adın (iletişim)" node tools/build-data.mjs`. HTTP 429 sunucunun yoğun olduğu anlamına gelir, betik bekleyip yeniden dener.
- Seçenekler: `--city istanbul`, `--embed-only` (indirme yok, `data/` dosyalarını gömer), `--html <dosya>`, `--geom-only`, `--geom-all`, `--geom-batch <n>`, `--geom-tol <metre>`, `--no-geom`, `--reorder`.

Yakın duraklar tek aktarma noktasında birleşir. Bir aktarma noktası raylı durakları için en çok 750 m, otobüs durakları katılınca en çok 450 m yayılabilir, böylece zincirleme birleşme yürüme süresini gizlemez. Nokta, varsa raylı istasyonun adıyla anılır.

Gerçek otobüs ağı varken kişi yalnızca yürüyerek (en çok 1,5 km) bir durağa gider. Otobüs yaklaşık 15 km/s ortalama hız ve 7 dakika bekleme ile hesaplanır. Yakında hiç durak yoksa eski ortalama hızlı otobüs varsayımı yedek olarak kullanılır.

## Lisans

Kod [PolyForm Noncommercial 1.0.0](LICENSE) lisansıyla yayımlanır. Kişisel, hobi, araştırma, eğitim ve kâr amacı gütmeyen kurumların kullanımı serbesttir, kodu değiştirip ticari olmayan amaçla paylaşabilirsin. Ticari kullanım için izin gerekir: [@mehmetsahinnn](https://github.com/mehmetsahinnn) ile iletişime geç. Bu lisans açık kaynak (OSI) tanımına girmez, kaynak kodu görülebilir bir lisanstır.

Bu lisans `data/` altındaki ve `index.html` içine gömülü hat verisini kapsamaz. O veri © OpenStreetMap katkıcılarına aittir ve [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/) altındadır. ODbL ticari kullanıma izin verir, bu nedenle veri için ticari kullanım yasağı koyamam. Veriyi kullanırken ya da yeniden dağıtırken "© OpenStreetMap contributors" atfı gerekir. Gömülü Leaflet kütüphanesi BSD-2-Clause lisanslıdır (© Vladimir Agafonkin, bildirimi `index.html` içinde korunmuştur) ve bu lisanstan etkilenmez.
