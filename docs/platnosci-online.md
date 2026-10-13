# Płatności online: plan

Na razie rezerwację opłaca się przelewem (3 dni) albo voucherem, a Dominika oznacza wpłatę
w panelu. Ten dokument opisuje, co zrobić, gdy dojdą płatności online (BLIK, karta, szybki
przelew). Nic z tego nie jest jeszcze w kodzie.

## Najpierw decyzje i dane (Dominika)

- [ ] **Forma działalności i dane firmy.** Operator płatności wymaga NIP i konta firmowego.
  Są to te same dane, na które czekają regulamin i polityka (`legal` w `src/lib/site.ts`).
- [ ] **Wybór operatora.** Rekomendacja: **Stripe Checkout**. Jedna integracja daje kartę, BLIK
  i Przelewy24, płatność odbywa się na stronie Stripe (strona nie dotyka danych karty), a tryb
  testowy działa bez umowy, więc całość można zbudować i przetestować przed podpisaniem
  czegokolwiek. Alternatywy: Przelewy24 albo tpay bezpośrednio (polskie, znane klientom;
  integracja przez podpisywane żądania i webhook, podobny zakres pracy).
  **Prowizje sprawdzić w aktualnych cennikach przed decyzją.**
- [ ] **Czy płatność online ma być jedyną metodą**, czy obok przelewu (proponuję: obok, przelew
  zostaje jako zapas, voucher bez zmian).
- [ ] **Zwroty**: robione ręcznie w panelu operatora (proponuję na start) czy przyciskiem
  w panelu strony.
- [ ] Opcjonalnie: **sprzedaż voucherów online** (dziś „Kup voucher” prowadzi do formularza).

## Jak to zadziała

1. Uczestnik wybiera „Płatność online”. Serwer zapisuje rezerwację jako `awaiting_payment`
   z **krótką blokadą miejsca (ok. 30 min)** zamiast 3 dni i tworzy sesję płatności u operatora.
2. Przeglądarka przechodzi na stronę płatności, potem wraca na `/zapis/platnosc?b=<id>`
   („Dziękuję, czekam na potwierdzenie płatności”). Ta strona niczego nie potwierdza.
3. **Potwierdza tylko webhook** operatora (`POST /api/platnosc/<operator>`): serwer sprawdza
   podpis, kwotę i walutę, a potem wywołuje tę samą ścieżkę co przycisk „Opłacona” w panelu
   (`markPaid` w `src/server/bookings.ts`), więc mail z potwierdzeniem i adresem pracowni
   jest ten sam.
4. Nieopłacona blokada wygasa w `tick()` (`src/server/tick.ts`) i zwalnia miejsce.

## Miejsca w kodzie, które trzeba zmienić

**Pułapki** (bez nich webhook nie zadziała albo zadziała dwa razy):
- `src/middleware.ts`: sprawdzanie `Origin` blokuje każde żądanie spoza strony poza
  `/newsletter/wypisz` (`ORIGIN_FREE`). Ścieżka webhooka musi tam trafić; chroni ją podpis.
- `deploy/nginx/mikipierniki.pl.conf`: limit 20 POST/min na IP. Operator wysyła z kilku adresów,
  więc webhook potrzebuje osobnego `location` bez tego limitu.
- `markPaid` rzuca błąd, gdy rezerwacja nie czeka na wpłatę. Operator ponawia webhooki,
  więc „już opłacona” musi kończyć się odpowiedzią 200, a nie błędem. Klucz: numer
  rezerwacji + identyfikator płatności u operatora.
- Wpłata po wygaśnięciu blokady (miejsce mogło już zniknąć): zapisać płatność, oznaczyć do
  decyzji Dominiki w panelu (zwrot albo dopisanie), nie potwierdzać automatycznie.

**Baza** (`src/server/db.ts`, migracja 3): w `bookings` kolumny na identyfikator sesji/płatności
u operatora i zapłaconą kwotę. `payment` dostaje wartość `online`.

**Formularz i API**: `src/pages/api/rezerwacja.ts` (`z.enum`), `src/lib/types.ts`
(`PaymentMethod`), `src/components/workshops/SignupDialog.astro` (opcje płatności i tekst
po wysłaniu), `src/server/bookings.ts` (`createBooking`: krótka blokada zamiast 3 dni,
odpowiedź z adresem strony płatności).

**Ustawienia**: klucze operatora i sekret webhooka w `astro.config.mjs` (schemat `env`),
`src/server/config.ts` i `deploy/env.example`.

**Teksty**, które dziś mówią „przelew albo voucher” albo „bez płatności online”:
- `src/pages/polityka-prywatnosci.astro`: komentarz na górze i sekcja o narzędziach
  zewnętrznych; operator musi trafić na listę odbiorców danych,
- `src/pages/regulamin.astro`, sekcja 3 „Płatność” (i zwroty w sekcji 4),
- FAQ „Jak mogę zapłacić?” w `src/lib/mock-data.ts`,
- `docs/dane.md` (Warsztaty otwarte → Płatność),
- maile w `src/server/emails.ts` (potwierdzenie opłaconej rezerwacji może zostać bez zmian).

**Testy**: `scripts/e2e.mjs` z webhookiem w trybie testowym operatora: płatność potwierdza
rezerwację raz, powtórzony webhook nic nie zmienia, zły podpis → 400, wygasła blokada
zwalnia miejsce.
