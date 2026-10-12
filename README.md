# Miki Pierniki

Strona warsztatów dekorowania pierników i pierników na zamówienie. Astro 7 z adapterem Node:
podstrony są statyczne, a terminy, formularze i panel Dominiki (`/panel`) działają na serwerze
z bazą SQLite. Wdrożenie na VPS: `deploy/README.md`.

## Uruchomienie

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # astro check + build do dist/ (client/ statyczne, server/ Node)
node dist/server/entry.mjs   # zbudowana wersja, jak na serwerze (HOST, PORT z env)
npm run test:e2e # po buildzie: zapisy, maile, newsletter i panel na tymczasowej bazie
```

Ustawienia serwera są w `.env` (wzór: `deploy/env.example`); lokalnie wszystkie są opcjonalne.
Baza tworzy się sama w `data/mikipierniki.sqlite`. Bez `SMTP_HOST` maile nie wychodzą, tylko
zapisują się w `data/mail/` (tekst i HTML), więc można je obejrzeć. Panel lokalnie działa bez
hasła, na serwerze wymaga `PANEL_PASSWORD`.

**Jak działają zapisy:** Dominika dodaje w panelu termin jako *propozycję*. Odwiedzający
zaznaczają „pasuje mi” (bez płatności). Gdy zbierze się grupa, Dominika *otwiera zapisy* i jednym
przyciskiem wysyła chętnym link do rezerwacji. Rezerwacja to przelew w 3 dni albo voucher;
po wpłacie Dominika klika „Opłacone” i uczestnik dostaje potwierdzenie z adresem pracowni,
a dzień przed warsztatami przypomnienie.

Wymaga Node ≥ 22.12. Podgląd sezonu: `?sezon=swieta`, `?sezon=wielkanoc`, `?sezon=rok`.

## Struktura

```
src/
  styles/tokens.css     kolory marki (tylko wersja jasna), akcent sezonowy, fonty
  styles/global.css     baza, .wrap, .section, .btn, .chip, .card, formularze, .ph (placeholder zdjęcia)
  lib/types.ts          kontrakt danych (Term, BookingRequest, InterestRequest, ...)
  lib/mock-data.ts      treści statyczne: FAQ, galeria, miejsce; opinie są nadal PRZYKŁADOWE
  lib/api.ts            dane statyczne + wysyłka formularzy z przeglądarki do /api
  server/               tylko serwer: baza (db.ts), terminy, zgłoszenia, rezerwacje, newsletter,
                        szablony maili (emails.ts), kolejka maili (mail.ts), zadania w tle (tick.ts)
  middleware.ts         hasło do panelu, ochrona formularzy przed innymi stronami, start zadań w tle
  lib/format.ts         daty po polsku, odmiana liczebników, etykiety
  lib/site.ts           dane kontaktowe, nawigacja, kalendarz sezonów
  layouts/Base.astro    <head>, SEO, nagłówek, stopka, pasek mobilny, sezon
  components/           wspólne klocki (Cookie, SectionHead, PageHead, InquiryForm, FaqList, Newsletter, ...)
  components/workshops/ TermCard, TermsList (z filtrami), SignupDialog (rezerwacja), InterestDialog (propozycje)
  components/panel/     formularz terminu w panelu
  layouts/Panel.astro   układ panelu
  components/home/      sekcje strony głównej
  pages/                podstrony; api/ (formularze), panel/, newsletter/ i zapis/ (linki z maili)
deploy/                 nginx, systemd, kopie zapasowe, instrukcja wdrożenia
scripts/e2e.mjs         test całego przepływu na zbudowanej wersji
docs/szkic.html         zatwierdzony szkic wizualny
```

## Zasady

- Kolory tylko przez tokeny z `tokens.css`, żadnych literałów w komponentach (wyjątek: ilustracje pierników).
- Strona ma jedną wersję kolorystyczną (jasną). Nie dodawaj reguł `prefers-color-scheme`.
- Dane statyczne tylko przez `src/lib/api.ts`, terminy tylko przez `src/server/terms.ts`. Strony nie importują `mock-data.ts`.
- Kod z `src/server/` nie może trafić do skryptów w przeglądarce (importuje `node:sqlite`).
- Strony renderowane na serwerze mają `export const prerender = false`. Reszta zostaje statyczna.
- Adres pracowni nie trafia na stronę ani do repozytorium: jest tylko w `STUDIO_ADDRESS` na serwerze i w mailach z potwierdzeniem.
- Treść sezonowa: renderuj wszystkie warianty z `data-for-season="swieta"` itd., CSS pokazuje właściwy.
- Zdjęcia: do czasu prawdziwych zdjęć `<div class="ph" data-label="zdjęcie: …">` z ilustracją `<Cookie>`.
- Nowe zdjęcie: `node scripts/zdjecia.mjs <plik> <nazwa>` tworzy w `public/zdjecia` wszystkie szerokości, których używa `<Photo>`.
- Czcionki są w `public/fonts` (bez Google Fonts), deklaracje w `styles/fonts.css`.
- Teksty po polsku, w pierwszej osobie Dominiki (forma żeńska), zwracamy się do czytelnika na „Ty”.
- Każda kontrolka formularza ma stałe `id` i `<label>`.
- Mobile first, strona nie może przewijać się w poziomie przy 360 px.
