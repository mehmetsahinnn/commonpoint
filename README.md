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
