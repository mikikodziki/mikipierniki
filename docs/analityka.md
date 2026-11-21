# Analityka strony: propozycja

Stan na 21.11.2026: strona nie ma żadnej analityki. Polityka prywatności (pkt 7) mówi wprost, że
strona nie zapisuje cookies ani localStorage i że „Nie używam narzędzi analitycznych ani
reklamowych”. Dane nie wychodzą poza EOG; wyjątki to mapa Google (po kliknięciu) i Instagram.
Każde narzędzie, które dotyka odwiedzających, wymaga więc zmiany polityki i zgody Dominiki jako
administratorki. Nic z tego nie jest jeszcze w kodzie.

Do Nowego Roku stronę oglądają głównie znajomi (faza „Pasuje mi”), więc liczby będą małe. Teraz
warto uruchomić to, co potrzebuje czasu (Search Console), i zebrać punkt odniesienia przed
płatnymi warsztatami.

## Decyzje

- [ ] **Ruch na stronie:** A) własne statystyki w panelu (**rekomendacja**), B) Plausible,
  C) Umami Cloud, albo nic.
- [ ] **Przy A:** strony dziś prerenderowane (galeria, o mnie, FAQ, kontakt, zamówienia, prawne,
  404) przechodzą na renderowanie przy każdym wejściu (`prerender = false`). To odwraca obecne
  ustawienie, w którym te strony są budowane z góry, patrz punkt 3A.
- [ ] **Search Console:** czyje konto Google (proponuję Dominiki, z dostępem dla Dawida) i jak
  potwierdzić domenę: plik HTML w `public/` (zwykły deploy) albo rekord TXT w OVH (zmiana DNS).
- [ ] **Monitoring dostępności:** UptimeRobot (darmowe konto).
- [ ] Opcjonalnie: pole „Skąd o mnie wiesz?” w formularzach.
- [ ] Opcjonalnie: profil firmy w Google (Google Business Profile). To decyzja Dominiki, m.in. czy
  pokazać adres pracowni.
- [ ] Tekst polityki prywatności po wyborze: do przeglądu prawnika razem z resztą (`legal.draft`).

## 1. Wyszukiwarka: Google Search Console i Bing Webmaster Tools

Pokazują frazy, po których ludzie trafiają na stronę, pozycje, kliknięcia, wyświetlenia i błędy
indeksowania. Przyjmują też `sitemap.xml`. Bing ma podobno import ustawień z Search Console (do sprawdzenia).

- Darmowe i bez żadnego skryptu na stronie. Nie dotykają danych odwiedzających, więc polityka
  się nie zmienia.
- Odpowiadają na otwarte pytanie, czy ochrona przed botami na hostingu (429 dla klientów
  spoza przeglądarki) nie blokuje Googlebota. Sprawdza to test na żywo w „Sprawdzaniu adresu URL”.

## 2. Zapisy i zapytania: dane już są w bazie

Głosy na terminy, rezerwacje, lista rezerwowa, zapytania i zapisy do newslettera mają daty
w SQLite. Zakładka „Statystyki” w panelu może je zliczać po miesiącach i terminach. Nie zbiera to
żadnych nowych danych, więc polityka się nie zmienia.

Opcjonalnie pole „Skąd o mnie wiesz?” (Instagram / Google / od znajomych / inne) w formularzach.
W małej firmie to najpewniejsze źródło wiedzy o tym, skąd przychodzą klienci, i działa bez
śledzenia. Wymaga jednego zdania w polityce, bo to dodatkowa odpowiedź w formularzu.

## 3. Ruch i źródła wejść: główny wybór

|  | A. Własne statystyki | B. Plausible Cloud | C. Umami Cloud (Hobby) |
|---|---|---|---|
| Koszt | 0 zł, ok. dnia pracy | 9 USD/mies. (Starter, 10 tys. odsłon) | 0 zł (do 100 tys. zdarzeń/mies.) |
| Skrypt w przeglądarce | nie | tak | tak |
| Cookies | nie | nie | nie |
| Kto dostaje dane | nikt nowy (serwer strony) | Plausible (Estonia, dane w UE) | Umami Software, Inc. (USA), region UE do wyboru |
| Jak długo dane | bez limitu (same sumy) | bez limitu | 6 miesięcy |
| Kliknięcia (telefon, Instagram, mapa) | nie | tak | tak |
| Raport mailem | nie (jest panel) | tak | nie |

### A. Własne statystyki w panelu (rekomendacja)

Serwer zlicza wejścia na strony i zapisuje do SQLite same sumy dzienne:
- datę i stronę;
- źródło, czyli samą domenę z nagłówka `Referer` (np. instagram.com, google.com);
- `utm_source`, `utm_medium` i `utm_campaign` z adresu;
- typ urządzenia (telefon albo komputer).

Nie zapisuje adresu IP, pełnego User-Agenta ani identyfikatora odwiedzającego. Jako „wizyty”
liczą się wejścia z innej domeny niż nasza: to przybliżenie odwiedzin bez żadnego identyfikatora.

- **Kto się liczy:** tylko prawdziwe przejścia przeglądarki, czyli GET z nagłówkami
  `Sec-Fetch-Dest: document` i `Sec-Fetch-Mode: navigate`, bez `Sec-Purpose: prefetch`.
  Przeglądarki wysyłają te nagłówki, proste boty nie. Dodatkowo działa filtr znanych botów po
  User-Agencie.
- **Pomijane:** `/panel`, `/api/*`, strony z tokenem w adresie (`/zapis/*`, `/newsletter/*`)
  i wszystkie parametry adresu poza `utm_*`.
- **Panel „Statystyki”:** ostatnie 30, 90 i 365 dni; najczęściej oglądane strony, źródła
  i kampanie. Obok liczby z punktu 2, np. wejścia na `/warsztaty` i głosy na terminy.
- **Pułapka:** strony prerenderowane (galeria, o mnie, FAQ, kontakt, zamówienia, strony prawne,
  404) obsługuje statyczny handler adaptera Node, więc nie przechodzą przez middleware.
  Rozwiązania:
  1. `prerender = false` na tych stronach, czyli renderowanie przy każdym wejściu. Tak już działają
     `/` i `/warsztaty`, koszt to milisekundy. **Proponuję to**, bo jest prostsze.
  2. Opakowanie handlera w `start.mjs` (adapter w trybie `middleware`), co zmienia sposób
     uruchamiania aplikacji.
- **Plusy:**
  - Brak skryptu daje najmniejsze ryzyko prawne z trzech opcji (patrz „Zgoda” niżej).
  - Nie ma nowego odbiorcy danych: wszystko zostaje na hostingu w Polsce.
  - Narzędzie jest darmowe.
  - Same sumy bez danych osobowych można trzymać latami, więc da się porównać sezon świąteczny
    rok do roku.
  - Dominika i tak zagląda do panelu.
- **Minusy:**
  - Brak kliknięć (telefon, Instagram, mapa, otwarcie formularza), unikalnych osób i czasu na
    stronie.
  - Boty udające przeglądarkę trochę zawyżą liczby.
  - Utrzymujemy to sami.
- **Do sprawdzenia przy wdrożeniu:** czy LiteSpeed przekazuje nagłówki `Sec-Fetch-*` do Node.
  Sprawdzić też, co wysyła przeglądarka wbudowana w Instagram, bo stamtąd przyjdzie dużo wejść.

### B. Plausible Cloud

Plausible to najlepszy gotowy panel z tej trójki.
- **Plan i cena:** Starter za 9 USD/mies. obejmuje 10 tys. odsłon i jedną stronę. Przy płatności
  rocznej są „2 months free”. Ceny w EUR strona nie podaje. Jest 30 dni próby bez karty.
- **Firma i dane:** spółka z Estonii, dane w UE. Nie używa cookies i nie przechowuje adresów IP:
  do liczenia unikalnych osób używa skrótu z IP i soli zmienianej co 24 h.
- **Co jest w Starterze:** cele i własne zdarzenia (kliknięcia), raporty mailem, dane bez limitu
  czasu. Lejki są dopiero w planie Business. Na stronie nie ma informacji, czy raport kampanii UTM
  i integracja z Search Console wchodzą w Starter.
- **Minusy:**
  - Koszt.
  - Nowy odbiorca w polityce, z umową powierzenia (DPA).
  - Skrypt, a więc otwarte pytanie o zgodę (niżej).
  - Adresy z tokenem trzeba wyciąć ręcznie, wysyłając odsłony z oczyszczonym adresem.

### C. Umami Cloud (plan Hobby)

- **Plan:** darmowy, do 100 tys. zdarzeń miesięcznie, jedna strona, dane trzymane 6 miesięcy,
  bez raportów mailem. Region UE (Niemcy) wybiera się przy zakładaniu konta i potem nie da się go
  zmienić.
- **Minusy:**
  - Firma jest z USA (Delaware). Umowa powierzenia zawiera standardowe klauzule umowne (SCC),
    ale zdanie polityki „Dane nie trafiają poza EOG” trzeba by przepisać.
  - 6 miesięcy danych nie pozwala porównać sezonów rok do roku.
  - Ten sam problem ze zgodą co w B.

### Zgoda (dotyczy B i C, w mniejszym stopniu A)

- Plausible i Umami piszą, że baner nie jest potrzebny. To stanowisko producentów, nie organu
  nadzorczego.
- Wytyczne EDPB 2/2023 (wersja 2.0, pkt 33) mówią, że kod JavaScript, który każe przeglądarce
  wysłać zapytanie z informacjami, „clearly falls within the scope of Article 5(3)”. Wyjątków od
  zgody wytyczne nie rozstrzygają.
- Polski art. 399 ust. 3 Prawa komunikacji elektronicznej zwalnia ze zgody tylko w dwóch
  przypadkach: transmisji komunikatu i usługi, której użytkownik zażądał. Analityka nie jest
  tam wymieniona. Wytycznych UODO ani UKE o analityce bez cookies nie znalazłem.
- Wniosek: przy B i C pytanie „czy potrzebna zgoda” trzeba dać prawnikowi. Bez odpowiedzi nie
  wpisujemy do polityki, że zgoda nie jest potrzebna.
- A nie wysyła z przeglądarki niczego poza zwykłym wejściem na stronę, ale czyta nagłówki HTTP
  (Referer, User-Agent, Sec-Fetch). Pkt 43 wytycznych mówi, że zbieranie informacji z nagłówków,
  np. przy fingerprintingu, może podlegać art. 5(3). A nie tworzy identyfikatora ani odcisku
  przeglądarki i zapisuje tylko sumy, więc ryzyko jest najmniejsze z trzech. Ocena i tak należy
  do prawnika. Żeby czytać mniej, można zrezygnować z podziału na telefon i komputer.

### Odrzucone

- **Google Analytics 4:** wymaga banera zgody na cookies i wysyła dane do Google, także do USA.
  Kłóci się z czcionkami z własnego serwera i mapą wczytywaną dopiero po kliknięciu. Ma sens tylko
  przy reklamach Google Ads.
- **Microsoft Clarity, Hotjar (nagrania sesji, mapy cieplne):** nagrywają formularze z danymi
  osobowymi, także dzieci. Wymagają zgody.
- **Matomo na hostingu:** jest darmowe i pełne, ale to aplikacja PHP na tym samym koncie co baza
  z danymi uczestników i plik `.env` z hasłami. Dziura w Matomo odsłania wszystko. Do tego
  aktualizacje, a dostępności PHP i MySQL nie sprawdziłem.
- **Umami u siebie:** wersja 3 działa tylko na PostgreSQL, a hosting współdzielony
  najpewniej go nie ma.
- **Cokolwiek na AWS:** konto służy tylko kopiom bazy w darmowym planie i tak zostaje.
- **GoatCounter:** jest darmowy, ale źródła różnią się co do użytku komercyjnego i nie podają,
  gdzie są dane.

## 4. Instagram i newsletter

- Statystyki Instagrama są w aplikacji, na koncie profesjonalnym.
- Link w bio z oznaczeniem kampanii, np.
  `https://mikipierniki.pl/warsztaty?utm_source=instagram&utm_medium=bio`. Działa z A, B i C.
  Strony mają `canonical`, więc parametry nie szkodzą wyszukiwarce.
- Linki w newsletterze: `utm_source=newsletter`. Bez pikseli śledzących otwarcia maili.

## 5. Dostępność strony

- UptimeRobot Free sprawdza stronę co kilka minut (interwał do potwierdzenia przy zakładaniu konta)
  i wysyła maila, gdy przestanie działać. Według ich pomocy i regulaminu darmowy plan wolno używać
  komercyjnie.
- Do sprawdzenia: czy zapytania monitora nie dostają 429 od ochrony przed botami na hostingu.
  Jeśli tak, trzeba poprosić seohost o wyjątek.
- Błędy serwera pokazuje też Search Console.

## Do zmiany w tekstach (po wyborze)

- **Polityka prywatności, pkt 7:** zamiast „Nie używam narzędzi analitycznych” opis wybranego
  narzędzia i podstawa (art. 6 ust. 1 lit. f RODO, uzasadniony interes: statystyka).
- **Przy B albo C dodatkowo:** odbiorca na liście odbiorców i umowa powierzenia. Przy C także
  akapit o przekazywaniu danych poza EOG.
- **Wszędzie:** nowa data `privacyFrom` w `src/lib/site.ts` i wpis w rejestrze czynności
  przetwarzania (dokument „Ochrona danych”).
- **Przy A:** bez nowego odbiorcy. Wystarczy zdanie, że serwer zlicza wejścia bez cookies
  i skryptów i zapisuje tylko sumy.

## Niesprawdzone

- Co oferuje hosting: PHP, MySQL, dostęp do logów serwera, statystyki w DirectAdminie (np.
  AWStats). Jeśli są, można je obejrzeć za darmo jeszcze dziś.
- Plausible: cena w EUR oraz to, czy kampanie UTM i Search Console wchodzą w Starter.
- Czy Googlebot i UptimeRobot dostają 429.
- Interwał sprawdzania w darmowym UptimeRobot i import z Search Console do Bing.

## Źródła

- Plausible: [cennik](https://plausible.io/#pricing), [plany](https://plausible.io/docs/subscription-plans), [dane](https://plausible.io/data-policy)
- Umami: [cennik](https://umami.is/pricing), [FAQ chmury](https://docs.umami.is/docs/cloud/faq), [regulamin](https://umami.is/terms), [DPA](https://umami.is/dpa), [v3 tylko PostgreSQL](https://docs.umami.is/docs/guides/migrate-mysql-postgresql)
- [EDPB, Guidelines 2/2023 on Technical Scope of Art. 5(3) ePD, v2.0](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf)
- [Art. 399 Prawa komunikacji elektronicznej](https://arslege.pl/prawo-komunikacji-elektronicznej/k2200/a152402/)
- [Matomo: kiedy potrzebna zgoda](https://matomo.org/faq/general/do-i-need-consent-to-use-web-analytics-on-my-website/)
- [UptimeRobot: kto może używać darmowego planu](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan)
- [Google Business Profile: statystyki](https://support.google.com/business/answer/9918094)
- [GoatCounter](https://www.goatcounter.com/)
