# Dane od Dominiki (stan na 23.09.2026)

Jedyne źródło prawdy dla treści na stronie. Wszystko poniżej jest potwierdzone przez Dominikę,
chyba że zaznaczono „DO UZUPEŁNIENIA”.

## Marka i oprawa wizualna
Kierunek „piernik i papier": neutralne beże i brązy, proste układy, zero ozdobników.
Strona ma być przejrzysta — czyta się ją, a nie ogląda ramki.
Poprzednia wersja („butikowa cukiernia": róż, wino, falowane ramki z kokardą)
jest zachowana pod znacznikiem `wersja-1` w gicie.

- #EDE6DA beż — tło całej strony.
- #FAF7F1 papier — panele sekcji, napisy na ciemnym tle.
- #F2EBE0 piaskowy — co druga sekcja, ramki formularzy, etykiety.
- #CBB79A jasny brąz — przyciski po najechaniu, plusy w FAQ, paski wolnych miejsc.
- #6E5436 brąz — nadtytuły sekcji, linki, gwiazdki przy opiniach.
- #473A2C ciemny brąz — pasek nagłówka, ciemne bloki, przyciski w spoczynku.
- #3B3025 najciemniejszy brąz — pierwsza sekcja, voucher, karty terminów.
- #2B2219 — wszystkie napisy na jasnym tle, logo, ikona strony.
- Ostrzeżenia: #9C4A2F.
- Kolor sezonowy się nie zmienia — paleta jest jednorodna, sezon widać w treści.

Typografia:
- Nagłówki: DM Serif Display. Ma jedną grubość, więc `--display-weight` to 400.
- Tekst i etykiety: Jost.
- Nagłówek pierwszej sekcji (TYLKO on): Dancing Script 700 z cieniem i połyskiem,
  czyli napis „pisany lukrem". Wzór: zdjęcie piernika od Dominiki.
- Etykiety, przyciski, nadtytuły i nawigacja: wersaliki z odstępem 0,12 em.

Kształty i detale:
- ŻADNYCH ramek. Sekcje i pudełka odróżnia sam odcień tła plus bardzo delikatny
  cień pod panelem. Nie dodawać obramowań ani ozdobnych narożników.
- Zaokrąglenia: panele 10 px, pudełka i przyciski 6 px, drobiazgi 4 px.
- Przerywnik między sekcjami: pojedyncza cienka kreska.
- Pierwsza sekcja to JEDYNE miejsce na stronie, gdzie coś się rusza.
  Zdjęcie wypełnia cały panel, a cztery zdjęcia danego sezonu powoli
  przenikają jedno w drugie (32 s na pełny obieg) i delikatnie się przybliżają.
  Lewa strona wygląda jak zamarznięta szyba: pod tekstem leży to samo
  zdjęcie drugi raz, rozmyte i przyciemnione, a na nim szron — paprocie lodu
  gęste przy lewej krawędzi i igiełki wychodzące na ostre zdjęcie po prawej.
  Szron stoi w miejscu, zdjęcia zmieniają się „za szybą". Za tekstem szron
  jest celowo rzadszy, żeby napisy dało się czytać na każdym zdjęciu.
  Rysunek szronu (`public/szron.svg`) generuje skrypt `scripts/szron.mjs`
  (`node scripts/szron.mjs`); inny wzór = inna wartość SEED w skrypcie.
  Szron jest tylko na szerszych ekranach — na telefonie zdjęcie stoi pod
  tekstem i szronu nie ma.
  Zdjęcia są kadrowane `object-position: 28% 50%`, żeby pierniki wychodziły
  bardziej na prawo, tam gdzie nic ich nie zasłania. Liczba zdjęć musi być
  równa CZTERY — klatki animacji są pocięte na ćwiartki.
  Przy `prefers-reduced-motion` animacja znika i zostaje pierwsze zdjęcie.
- Rysunki falowanej ramki i kokardy (`public/ramka-fala*.svg`, `public/kokarda.svg`)
  zostały w repozytorium, ale NIC ICH NIE UŻYWA. To prace Dominiki — nie kasować
  bez pytania.
- Logo i ikona strony: grafika „przytulenie" w ciemnym brązie na papierze.

## Kontakt i miejsce
- Pracownia: Wrocław. Tu odbywają się wszystkie warsztaty otwarte.
- Adresu pracowni NIE publikujemy nigdzie na stronie — ani w treści, ani w danych
  strukturalnych. Podajemy wyłącznie miasto; dokładny adres dostaje uczestnik
  w potwierdzeniu zapisu. Z tego samego powodu zniknęła druga lokalizacja
  („Pracownia 2”) i sekcja z mapami na stronie Kontakt.
- Telefon: 880 122 269. E-mail: dominika.saczynska@gmail.com.
- Social media: tylko Instagram @mikipierniki. Brak Facebooka i TikToka.
- Domeny NIE publikujemy nigdzie w treści (adres strony jeszcze nie jest ustalony).

## Warsztaty otwarte
- Dla dorosłych: 3–4 godziny, 450 zł/os.
- Wieczorne z winem: 3–4 godziny, 500 zł/os. Lampka grzanego wina w cenie, warsztat od 18 lat.
- Dla dzieci: 2 godziny, 200 zł za dziecko. Dzieci 6–12 lat z rodzicem, starsze mogą być same.
  W sezonie tylko dwa takie terminy.
- Grupa: minimum 4 osoby, maksimum 10.
- Każdy dekoruje 6–8 pierników i zabiera wszystkie do domu.
- W cenie: gotowe pierniki, lukry (resztę lukru można zabrać do domu), rękawy cukiernicze,
  fartuchy, napoje, pudełko na pierniki.
- Terminy w `src/lib/mock-data.ts` są nadal PRZYKŁADOWE — czekamy na prawdziwy grafik.

## Warsztaty firmowe i zamknięte
- Wycena indywidualna, zależna od liczby osób i czasu.
- U Dominiki w pracowni albo z dojazdem do klienta.
- Przy większych grupach krótsze cykle: 1–2 pierniki na osobę i rotacja grup albo
  stanowisko do lukrowania dla chętnych.

## Pierniki na zamówienie
- Cena zależy od wielkości i trudności zdobienia: mały (np. gwiazdka) 15 zł, średni 25 zł, duży 35 zł.
- Zestaw w pudełku: 1 duży + 2 średnie + 3 małe = 120 zł.
- Minimalne zamówienie detaliczne: 100 zł.
- Zamówienia firmowe z personalizacją i własnym kształtem: od 1500 zł, zadatek 15%.
- Personalizacja: klient wysyła opis albo zdjęcie inspiracji, a Dominika tworzy własne foremki
  i piecze ciastka w dowolnym kształcie (logo, produkt, budynek, maskotka firmowa).
- Terminy: detaliczne na święta do 18 grudnia, firmowe najpóźniej 2 tygodnie przed odbiorem.
- Wysyłka Paczkomatem: mała paczka 12 zł, duża 20 zł. Odbiór osobisty w pracowni też możliwy.

## Voucher
- 500 zł, ważny rok, na dowolne warsztaty.
- Forma: PDF albo drukowany, przy czym drukowany tylko do odbioru osobistego.
- Realizacja: obdarowany zapisuje się na wybrany termin i wybiera płatność kartą podarunkową.

## O Dominice
- Piecze i dekoruje pierniki od 14 lat. Samouk.
- Zaczęło się od pieczenia pierniczków z przyjaciółką, potem przyszło zdobienie.
- Najpierw pierniki dla rodziny i przyjaciół, potem sprzedaż na targach świątecznych.
- Warsztaty zaczęła prowadzić w szkole, później dla przyjaciół.
- Najbardziej lubi magiczną atmosferę warsztatów i moment, w którym ktoś odkrywa swój talent
  i jest zadowolony ze swojego dzieła.
- Bez sekcji „w liczbach” — żadnych statystyk na stronie.

## Alergeny
Pierniki zawierają gluten, jajka, soję i laktozę, mogą zawierać śladowe ilości orzechów.

## Zdjęcia z warsztatów
Dominika zawsze pyta uczestników o zgodę przed publikacją.

## Zdjęcia
Dominika przekazała 10 zdjęć pierników (świąteczne i wielkanocne), są w `public/zdjecia`.
Portret Dominiki jest (`portret-*.webp`) i stoi na „O mnie” oraz w sekcji o niej
na stronie głównej. Nadal brak zdjęć z warsztatów, więc galeria nie ma kategorii
„Z warsztatów”.

## Czeka na dane
- Prawdziwe terminy, liczba wolnych miejsc.
- Prawdziwe opinie uczestników (obecne są przykładowe).
- Zdjęcia z warsztatów.
- Dane działalności do regulaminu i polityki prywatności (nazwa, NIP, adres, numer konta).
- Zasady rezygnacji: na stronie jest zwrot do 7 dni przed terminem — DO POTWIERDZENIA.
