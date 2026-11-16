# Wersja do publikacji — przekazanie dla Dawida

Repozytorium: https://github.com/mikikodziki/mikipierniki

Zatwierdzony frontend: gałąź `feat/frontend`, tag `wersja-do-publikacji`, wydanie
„Wersja do publikacji” w GitHub Releases. Tag wskazuje konkretną wersję, niezależnie
od kolejnych zmian na gałęzi.

## Co jest w tej wersji

- Świąteczne hero: cztery zdjęcia z płynną rotacją co 8 sekund, bez szronu,
  nagłówek „Warsztaty lukrowania pierników” krojem Berkshire Swash.
- Galeria z kategorią Halloween i powiększaniem zdjęć po kliknięciu.
- Aktualny portret Dominiki, zdjęcie przy stoisku i zdjęcia efektów warsztatów.
- Ośmiopunktowy przebieg warsztatu, poprawione odstępy i kontrast sekcji.
- Mapa pracowni przy Długiej 55J z dokładnym punktem adresowym.
- Mniejszy voucher bez szronu, ciemnozielona sekcja zamówienia i jasny formularz.

## Ważne rozróżnienie przed wdrożeniem

Ta wersja jest zatwierdzonym frontendem. `src/lib/api.ts` nadal zawiera funkcje
demonstracyjne: `createBooking`, `sendInquiry` i `subscribeNewsletter`.
Nie wysyłają poczty, nie zapisują rezerwacji i nie pobierają płatności.
Nie należy uruchamiać przyjmowania zamówień, opierając się na tych potwierdzeniach.

Zaplecze jest już w tym samym repozytorium na gałęzi `feat/zapisy`
(stan przy przekazaniu: commit `c7dbbf6`). Zawiera API, SQLite, wysyłkę poczty,
panel, testy oraz konfigurację nginx, systemd i GitHub Actions.

Instrukcje zaplecza:

- [Wdrożenie na VPS](https://github.com/mikikodziki/mikipierniki/blob/feat/zapisy/deploy/README.md).
- [Konfiguracja środowiska — przykład bez haseł](https://github.com/mikikodziki/mikipierniki/blob/feat/zapisy/deploy/env.example).
- [Płatności online](https://github.com/mikikodziki/mikipierniki/blob/feat/zapisy/docs/platnosci-online.md).

Gałęzie nie zostały automatycznie scalone. Przy integracji trzeba zachować wygląd
z tagu `wersja-do-publikacji` i działanie serwera z `feat/zapisy`. W szczególności
nie zastępować serwerowego `src/lib/api.ts`, konfiguracji adaptera Node ani obsługi
bazy i poczty ich demonstracyjnymi odpowiednikami z frontendu. Gałąź zaplecza ma
także zmiany fontów i stylów — wygląd referencyjny jest na tagu tego wydania.

## Pobranie i sprawdzenie frontendu

Wymagany Node.js co najmniej 22.12; wersja użyta do sprawdzenia: 22.23.2.

```sh
git clone https://github.com/mikikodziki/mikipierniki.git
cd mikipierniki
git fetch origin --tags
git switch --detach wersja-do-publikacji
npm ci
npm run build
npm run preview -- --host 127.0.0.1
```

Build wykonuje kontrolę typów i generuje `dist/`. Ta wersja nie wymaga sekretów
do zbudowania. Zdjęcia i grafiki są w repozytorium; nie trzeba kopiować niczego
z Pulpitu ani katalogu Downloads Dominiki.

Archiwum `mikipierniki-wersja-do-publikacji-frontend.zip` przy wydaniu zawiera
gotowy katalog `dist/` i tę instrukcję. Jest paczką zatwierdzonego wyglądu,
a nie pełnym serwerem rezerwacji. Plik `.sha256` pozwala sprawdzić jego integralność.

## Publikacja pod domeną

Po integracji z `feat/zapisy` korzystaj z tamtejszej instrukcji VPS. Zaplecze
wymaga Node.js 24 i ustawień środowiska opisanych w `deploy/env.example`,
w tym konfiguracji bazy, poczty i panelu. Sekrety muszą pozostać na serwerze
lub w GitHub Secrets, poza repozytorium.

W konfiguracji frontendu domena nie jest jeszcze ustawiona. Docelowy build
powinien mieć właściwe `site` w `astro.config.mjs`, aby wygenerować canonical,
`og:url` i pełne adresy w danych strukturalnych. Konfiguracja gałęzi zaplecza
zawiera już `site`; trzeba sprawdzić, czy odpowiada docelowej domenie.

Frontend generuje pliki takie jak `warsztaty.html`, a linki mają postać
`/warsztaty`. Hosting musi obsługiwać te adresy bez rozszerzenia. Konfiguracja
nginx na gałęzi zaplecza zawiera obsługę tras aplikacji. Przy samym statycznym
podglądzie trzeba zapewnić odpowiednie mapowanie `.html`.

Po ustawieniu DNS i HTTPS sprawdź otwieranie i odświeżanie `/warsztaty`, `/galeria`,
`/o-mnie` i `/kontakt`, a także formularze, rezerwację, wysyłkę i odbiór poczty
oraz faktyczną obsługę płatności zgodnie z konfiguracją zaplecza. Testy na gałęzi
zaplecza uruchamiają `npm run test:e2e` i `npm run check:launch`.

Terminy, liczba miejsc i dwie pozostałe opinie w frontendzie są przykładowe.
Regulamin i polityka prywatności zawierają pola do uzupełnienia danymi działalności
i dostawców usług. Do publikacji funkcji sprzedażowych należy użyć rzeczywistych
danych i ustawień z zaplecza, uzgodnionych z Dominiką.

## Cofnięcie wyglądu

Poprzednia zatwierdzona wersja to commit `324f73f` („Wersja 2”).
Nowego tagu nie należy przesuwać; kolejne poprawki powinny otrzymać osobną wersję.
