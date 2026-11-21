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
- Nagłówek pierwszej sekcji: ozdobny Berkshire Swash 400. Treść świątecznego
  hero: „Warsztaty lukrowania pierników”.
- Etykiety, przyciski, nadtytuły i nawigacja: wersaliki z odstępem 0,12 em.

Kształty i detale:
- ŻADNYCH ramek. Sekcje i pudełka odróżnia sam odcień tła plus bardzo delikatny
  cień pod panelem. Nie dodawać obramowań ani ozdobnych narożników.
- Zaokrąglenia: panele 10 px, pudełka i przyciski 6 px, drobiazgi 4 px.
- Przerywnik między sekcjami: pojedyncza cienka kreska.
- Świąteczne hero ma cztery zdjęcia: `hero-swieta-galazki-pierniki-*.webp`
  oraz trzy serie `hero-swieta-lampki-*.webp`. Źródła to „Świąteczne gałązki
  z piernikami.png”, „Piernikowy miś i choinka wśród złotych świateł.png”,
  „Świąteczne pierniki wśród świerkowych gałązek.png” i „Piernikowy Mikołaj
  i domek wśród świerku.png” (każde 1672 × 941 px).
  Gałązki i lampki są po lewej, pierniki po prawej. Bez szronu i dodatkowej
  rozmytej warstwy; pod tekstem jest tylko łagodne przyciemnienie.
  Kadr: `object-position: 80% 50%`. Na telefonie zdjęcie stoi pod tekstem.
  Wszystkie sezony mają po cztery zdjęcia, które zmieniają się co 8 sekund,
  płynnie przenikają i delikatnie przybliżają (32 sekundy na pełen cykl).
  Pierwszy obraz jest widoczny od razu po otwarciu strony. Przy
  `prefers-reduced-motion` zostaje pierwsze zdjęcie. Animacja jest wyłącznie w hero.
  Dawny szron i jego generator są w `docs/archiwum/`; hero już z nich nie korzysta.
- Rysunki falowanej ramki i kokardy, stare logo i zdjęcia z wcześniejszych wersji są w
  `docs/archiwum/` (przeniesione z `public/` 20.11.2026, nie skasowane). To prace Dominiki.
- Logo i ikona strony: grafika „przytulenie" w ciemnym brązie na papierze.

## Kontakt i miejsce
- Pracownia: Wrocław. Tu odbywają się wszystkie warsztaty otwarte.
- Adres pracowni: ul. Długa 55J, Wrocław. Na życzenie Dominiki adres jest publiczny:
  sekcja „Gdzie się spotykamy” na stronie Kontakt zawiera mapę Google z pinezką
  przy tym adresie. Mapa ma maksymalnie 380 px szerokości, bez osobnego bloku
  adresu i przycisku do trasy pod tekstem sekcji. Adres jest przy danych kontaktowych
  i w danych strukturalnych strony Kontakt. Poprzednia zasada ukrywania adresu
  już nie obowiązuje. Drugiej lokalizacji („Pracownia 2”) nie ma.
- Pinezka korzysta ze współrzędnych punktu adresowego 55J:
  `51.123959, 17.013382`. Źródło: [SIP Wrocławia — Długa 55J](https://geoportal.wroclaw.pl/poi/pt/118745/ul.D%C5%82uga/55J).
  Wyszukiwanie samej nazwy adresu w Google wskazuje numer 55, dlatego nie należy
  zastępować współrzędnych zapytaniem tekstowym. Punkt z miejskiego układu
  EPSG:2177 przeliczono na WGS84 (EPSG:4326).
- Telefon: 880 122 269. E-mail: mika@mikipierniki.pl (od 21.11.2026).
- Social media: tylko Instagram @mikipierniki. Brak Facebooka i TikToka.
- Domena: mikipierniki.pl (ustawiona w `astro.config.mjs`, stąd canonical i og:url).

## Warsztaty otwarte
- Dla dorosłych: 3–4 godziny, 450 zł/os.
- Wieczorne: 3–4 godziny, 500 zł/os., dla dorosłych. Kubek rozgrzewającego ponczu korzennego (bez alkoholu) w cenie (od 21.11.2026 bez wina).
- Dla dzieci: 2 godziny, 200 zł za dziecko. Dzieci 6–12 lat z rodzicem, starsze mogą być same.
  W sezonie tylko dwa takie terminy.
- Grupa: minimum 4 osoby, maksimum 10.
- Każdy dekoruje 6–8 pierników i zabiera wszystkie do domu.
- W cenie: gotowe pierniki, lukry (resztę lukru można zabrać do domu), rękawy cukiernicze,
  napoje, pudełko na pierniki.
- Terminy Dominika dodaje sama w panelu (`/panel`). Najpierw jako „propozycję terminu”:
  chętni zaznaczają, że im pasuje, a gdy zbierze się grupa, Dominika otwiera zapisy
  i jednym przyciskiem wysyła im link do rezerwacji.
- Zgłoszenie na propozycję nie wymaga logowania, więc kolejne zgłoszenie z tym samym adresem
  nie zmienia już zapisanego (imię, telefon, liczba osób zostają). Zmiany: mailem do Dominiki.
  Wycofane zgłoszenie zostaje (bez telefonu i uwag) do 30 dni po terminie, żeby nikt nie zapisał
  tej osoby ponownie.
- Płatność: przelew w ciągu 3 dni albo voucher. Płatności online (BLIK, karta) będą później
  (plan: `docs/platnosci-online.md`).
- Rezygnacja: zwrot całej kwoty albo przeniesienie do 7 dni przed terminem, później można
  przekazać miejsce innej osobie (potwierdzone 12.10.2026).
- E-maile do uczestników wychodzą z mika@mikipierniki.pl i tam wracają odpowiedzi (zmiana z warsztaty@, 21.11.2026).
- Przebieg warsztatu w ośmiu krokach: powitanie; konsystencje lukrów; trzymanie
  rękawa i prowadzenie linii; kontury i kolejność lukrowania; wypełnianie lukrem
  rzadkim; mokre na mokrym i detale; pakowanie; pytania i barwienie lukrów.
  Tempo dopasowane do grupy, bez osobnych czasów dla poszczególnych etapów.

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
- Sekcja zamówienia na stronie Warsztaty ma ciemnozielone tło i jasny, kremowy
  formularz z obrysowanymi polami. Delikatny szron jest wyłącznie na zewnętrznej
  prawej krawędzi sekcji. Na samym voucherze nie ma szronu — również na stronie głównej.
- Sam voucher ma maksymalnie 440 px szerokości. Jasny panel wewnętrzny jest
  nieco mniejszy, z węższym przejściem gradientowym na krawędziach.

## O Dominice
- Piecze i dekoruje pierniki od 14 lat. Samouk.
- Zaczęło się od pieczenia pierniczków z przyjaciółką, potem przyszło zdobienie.
- Najpierw pierniki dla rodziny i przyjaciół, potem sprzedaż na targach świątecznych.
- Warsztaty zaczęła prowadzić w szkole, później dla przyjaciół.
- Najbardziej lubi magiczną atmosferę warsztatów i moment, w którym ktoś odkrywa swój talent
  i jest zadowolony ze swojego dzieła.
- Bez sekcji „w liczbach” — żadnych statystyk na stronie.

## Alergeny i bezpieczeństwo
Pierniki zawierają gluten, jajka, soję i laktozę, mogą zawierać śladowe ilości orzechów.
- Złoty lukier jest niejadalny: na stronie trzeba to wyraźnie zaznaczyć (FAQ, cennik na
  /zamowienia, regulamin §7).
- Świeżość: w szczelnym pudełku spokojnie do pół roku, ale Dominika chce podkreślać, że pierniki
  to przede wszystkim ozdoby (decyzja 20.11.2026).

## Zdjęcia z warsztatów
Dominika zawsze pyta uczestników o zgodę przed publikacją.

## Zdjęcia
Galeria zawiera 26 zdjęć pierników: świątecznych, wielkanocnych, na okazje oraz Halloween.
Pliki są w `public/zdjecia`, w wersjach WebP o szerokościach 400, 600, 800, 1000 i 1600 px
(nowe zdjęcie: `node scripts/zdjecia.mjs <plik> <nazwa>`).
Do kategorii Halloween należy 10 zdjęć duszków, nietoperzy i dyń, przekazanych w HEIC.
Aktualny portret Dominiki (`portret-dominika-*.webp`) stoi na „O mnie” oraz w sekcji
o niej na stronie głównej. Źródło: `Portret kobiety w granatowej marynarce.png`
(1254 × 1254 px), warianty WebP 400, 600, 800, 1000 i 1254 px, bez powiększania oryginału.
Nadal brak zdjęć z przebiegu warsztatów, więc galeria nie ma kategorii
„Z warsztatów”.

W sekcji „Czym się wyróżniam” na „O mnie” jest zdjęcie Dominiki przy stoisku
świątecznym (`dominika-stoisko-swiateczne.webp`, 615 × 643 px). Źródło:
przekazany plik `2904243_b.jpg`. Zastępuje w tej sekcji zdjęcie kamieniczek.

Zdjęcia gotowych prac uczestników (`IMG_3813.HEIC`, `IMG_3849.heic`,
`IMG_3924.HEIC`) są w kafelkach sekcji opinii na stronie głównej jako `opinie-*.webp`.
Nie należą do galerii. Dwa towarzyszą istniejącym opiniom, a trzecie pokazuje efekty
warsztatów bez przypisywania dodatkowej opinii uczestnikowi. Kafelek z opinią Marka
i zdjęciem `IMG_3824.HEIC` został usunięty; pliki tego zdjęcia (`opinie-pierniki-na-talerzu-*`)
są w `docs/archiwum/`. Cała sekcja opinii jest ukryta, dopóki nie przyjdą prawdziwe
(decyzja z 20.11.2026, `src/lib/mock-data.ts`).

Trzy wcześniejsze zdjęcia `hero-swieta-mis-choinka`, `hero-swieta-mikolaj-domek`
i `hero-swieta-igliwie` są w `docs/archiwum/`. W świątecznym hero zastąpiły je
nowe `hero-swieta-galazki-pierniki` i trzy serie `hero-swieta-lampki-*`.
Wszystkie zdjęcia `hero-*` są wyłącznie do hero,
nie dodawaj ich do galerii.

Tło hero podstron to `igliwie-lampki-hq.webp` (2200 × 1650 px: środkowy pas oryginału
2200 × 3300, bo tylko on mieści się w nagłówkach), z lżejszym
`igliwie-lampki-mobile.webp` (900 × 1350 px) na telefony. Źródłem jest przekazany
plik `artur-stanulevich-drX8CsOCaks-unsplash.jpg` (4160 × 6240 px).
Zdjęcie jest używane wyłącznie jako tło nagłówków, bez dodawania do galerii.

## Czeka na dane
Pełną, aktualną listę braków w treści (z plikami i liniami) wypisuje `npm run check:launch`.
- Prawdziwe terminy (Dominika dodaje je w panelu).
- Numer konta, odbiorca przelewu i adres pracowni: ustawienia na serwerze (`deploy/env.example`);
  bez nich panel nie pozwala otworzyć zapisów.
- Prawdziwe opinie uczestników. Obecne są przykładowe i **nie mogą trafić na stronę** jako
  prawdziwe; pusta lista w `src/lib/mock-data.ts` ukrywa sekcję opinii (razem z kafelkiem
  „Efekty warsztatów”).
- Dane działalności do regulaminu i polityki prywatności: `legal` w `src/lib/site.ts`.
  Na 20.11.2026 Dominika nie ma zarejestrowanej działalności: dokumenty podają tylko jej imię
  i nazwisko oraz kontakt. Adresu nie wpisujemy do regulaminu ani polityki; każdy zapisany
  dostaje go w mailu. Po założeniu JDG uzupełnić nazwę, adres siedziby, NIP i REGON.
- Przeczytanie regulaminu i polityki przez prawnika (potem `legal.draft = false`).
- Zdjęcia z przebiegu warsztatów (zdjęcia gotowych prac są już w sekcji opinii).
