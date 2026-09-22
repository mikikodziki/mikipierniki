# Miki Pierniki

Strona warsztatów dekorowania pierników i pierników na zamówienie. Astro 7, statyczny build, dane na razie z mocków.

## Uruchomienie

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # astro check + build do dist/
```

Wymaga Node ≥ 22.12. Podgląd sezonu: `?sezon=swieta`, `?sezon=wielkanoc`, `?sezon=rok`.

## Struktura

```
src/
  styles/tokens.css     kolory (jasny/ciemny), akcent sezonowy, fonty
  styles/global.css     baza, .wrap, .section, .btn, .chip, .card, formularze, .ph (placeholder zdjęcia)
  lib/types.ts          kontrakt danych (Term, BookingRequest, InquiryRequest, ...)
  lib/mock-data.ts      PRZYKŁADOWE dane: terminy, opinie, FAQ, galeria
  lib/api.ts            jedyna warstwa dostępu do danych (później Supabase + endpointy)
  lib/format.ts         daty po polsku, odmiana liczebników, etykiety
  lib/site.ts           dane kontaktowe, nawigacja, kalendarz sezonów
  layouts/Base.astro    <head>, SEO, nagłówek, stopka, pasek mobilny, sezon
  components/           wspólne klocki (Cookie, SectionHead, PageHead, InquiryForm, FaqList, Newsletter, ...)
  components/workshops/ TermCard, TermsList (z filtrami), SignupDialog
  components/home/      sekcje strony głównej
  pages/                podstrony
docs/szkic.html         zatwierdzony szkic wizualny
```

## Zasady

- Kolory tylko przez tokeny z `tokens.css`, żadnych literałów w komponentach (wyjątek: ilustracje pierników).
- Dane tylko przez `src/lib/api.ts`. Strony nie importują `mock-data.ts`.
- Treść sezonowa: renderuj wszystkie warianty z `data-for-season="swieta"` itd., CSS pokazuje właściwy.
- Zdjęcia: do czasu prawdziwych zdjęć `<div class="ph" data-label="zdjęcie: …">` z ilustracją `<Cookie>`.
- Teksty po polsku, w pierwszej osobie Dominiki (forma żeńska), zwracamy się do czytelnika na „Ty”.
- Każda kontrolka formularza ma stałe `id` i `<label>`.
- Mobile first, strona nie może przewijać się w poziomie przy 360 px.
