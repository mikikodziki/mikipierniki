/**
 * Prices, venue, group sizes and workshop formats are REAL (docs/dane.md).
 * Dates, seats left and testimonials are still EXAMPLES until Dominika sends the 2026 schedule.
 */
import type { FaqItem, GalleryItem, Term, Testimonial, Venue } from "./types";

export const venues: Venue[] = [
  { id: "pracownia", name: "Pracownia Miki", address: "ul. Długa 55", addressLocative: "ul. Długiej 55", city: "Wrocław" },
  { id: "pracownia-2", name: "Pracownia 2", address: "", city: "Wrocław", addressPending: true },
];

const adult = { type: "dorosli", price: 450, priceUnit: "osoba", capacity: 10, cookies: "6–8", venueId: "pracownia", season: "swieta" } as const;
const evening = { type: "wieczor", price: 500, priceUnit: "osoba", capacity: 10, cookies: "6–8", venueId: "pracownia", season: "swieta" } as const;
const kids = { type: "dzieci", price: 200, priceUnit: "dziecko", capacity: 10, cookies: "6–8", venueId: "pracownia", season: "swieta" } as const;

export const terms: Term[] = [
  { ...adult, id: "t-2026-11-14", title: "Świąteczne klasyki", startsAt: "2026-11-14T11:00:00+01:00", endsAt: "2026-11-14T15:00:00+01:00", seatsLeft: 4 },
  { ...kids, id: "t-2026-11-15", title: "Pierniczki dla dzieci", startsAt: "2026-11-15T10:00:00+01:00", endsAt: "2026-11-15T12:00:00+01:00", seatsLeft: 7 },
  { ...evening, id: "t-2026-11-20", title: "Lukier i grzane wino", startsAt: "2026-11-20T18:00:00+01:00", endsAt: "2026-11-20T21:30:00+01:00", seatsLeft: 2 },
  { ...adult, id: "t-2026-11-28", title: "Zawieszki na choinkę", startsAt: "2026-11-28T11:00:00+01:00", endsAt: "2026-11-28T15:00:00+01:00", seatsLeft: 0 },
  { ...adult, id: "t-2026-11-29", title: "Renifery i bałwanki", startsAt: "2026-11-29T11:00:00+01:00", endsAt: "2026-11-29T14:30:00+01:00", seatsLeft: 8 },
  { ...evening, id: "t-2026-12-04", title: "Pierniki i swing", startsAt: "2026-12-04T18:00:00+01:00", endsAt: "2026-12-04T21:30:00+01:00", seatsLeft: 6 },
  { ...kids, id: "t-2026-12-06", title: "Mikołajkowe pierniki dla dzieci", startsAt: "2026-12-06T10:00:00+01:00", endsAt: "2026-12-06T12:00:00+01:00", seatsLeft: 9 },
  { ...evening, id: "t-2026-12-11", title: "Wieczór z lukrem i winem", startsAt: "2026-12-11T18:00:00+01:00", endsAt: "2026-12-11T21:30:00+01:00", seatsLeft: 5 },
  { ...adult, id: "t-2026-12-12", title: "Wianki i gwiazdy", startsAt: "2026-12-12T11:00:00+01:00", endsAt: "2026-12-12T15:00:00+01:00", seatsLeft: 3 },
];

// PRZYKŁADOWE opinie — Dominika prześle prawdziwe.
export const testimonials: Testimonial[] = [
  { author: "Kasia", context: "warsztaty świąteczne", text: "Byłam pewna, że nic mi nie wyjdzie, a wyszłam z pudełkiem pierników, których szkoda było zjeść. Dominika tłumaczy wszystko spokojnie i z humorem." },
  { author: "Marek", context: "warsztaty firmowe", text: "Najlepsza przedświąteczna integracja, jaką mieliśmy. Cały zespół wciągnął się tak, że przedłużyliśmy o godzinę." },
  { author: "Agnieszka", context: "warsztaty dla dzieci", text: "Byłyśmy z córką na warsztatach dla dzieci. Ona do dziś opowiada o swoim pierniczkowym reniferze." },
];

export const faq: FaqItem[] = [
  { topic: "warsztaty", q: "Czy muszę mieć jakieś doświadczenie?", a: "Nie. Warsztaty prowadzę od podstaw, a większość uczestników pierwszy raz trzyma w ręku rękaw cukierniczy." },
  { topic: "warsztaty", q: "Ile pierników zrobię i czy zabieram je do domu?", a: "W czasie warsztatów dekorujesz 6–8 pierników i zabierasz do domu wszystkie, w pudełku. Możesz też wziąć ze sobą lukier, który Ci zostanie." },
  { topic: "warsztaty", q: "Ile trwają warsztaty?", a: "Warsztaty dla dorosłych i wieczorne trwają od 3 do 4 godzin. Warsztaty dla dzieci trwają 2 godziny." },
  { topic: "warsztaty", q: "Co jest w cenie?", a: "Upieczone przeze mnie pierniki, lukry, rękawy cukiernicze, fartuch, napoje i pudełko na gotowe pierniki. Na warsztatach wieczornych dodatkowo lampka grzanego wina." },
  { topic: "warsztaty", q: "Od ilu lat dzieci mogą wziąć udział?", a: "Warsztaty dla dzieci są dla grupy 6–12 lat i dziecko przychodzi z rodzicem. Starsze dzieci radzą sobie same i mogą przyjść bez opiekuna." },
  { topic: "warsztaty", q: "Ile osób jest w grupie?", a: "Od 4 do 10 osób. Przy mniejszej liczbie chętnych termin może zostać odwołany, a wtedy przenoszę zapis na inny termin albo zwracam całą wpłatę." },
  { topic: "warsztaty", q: "Czy na warsztatach wieczornych jest alkohol?", a: "Tak, lampka grzanego wina jest w cenie, więc te warsztaty są dla osób pełnoletnich. Kto nie pije, dostaje to samo w wersji bezalkoholowej." },
  { topic: "warsztaty", q: "Czy pierniki są odpowiednie dla alergików?", a: "Pierniki zawierają gluten, jajka, soję i laktozę, mogą też zawierać śladowe ilości orzechów. Alergie wpisz w formularzu zapisu, a przygotuję się na miejscu." },
  { topic: "platnosci", q: "Jak mogę zapłacić?", a: "Online przez BLIK lub kartą, zwykłym przelewem w ciągu 3 dni od rezerwacji albo kartą podarunkową, jeśli dostałaś voucher." },
  { topic: "platnosci", q: "Co jeśli nie mogę przyjść?", a: "Do 7 dni przed terminem zwracam całą kwotę albo przenoszę rezerwację na inny termin. Później możesz przekazać swoje miejsce innej osobie." },
  { topic: "platnosci", q: "Jak działa voucher?", a: "Voucher kosztuje 500 zł i jest ważny rok. Obdarowana osoba zapisuje się na dowolny termin i przy płatności wybiera kartę podarunkową. Wersję PDF wysyłam mailem, drukowaną odbiera się w pracowni." },
  { topic: "zamowienia", q: "Ile kosztują pierniki na zamówienie?", a: "Cena zależy od wielkości piernika i tego, jak pracochłonne jest zdobienie: mały 15 zł, średni 25 zł, duży 35 zł. Zestaw w pudełku (1 duży, 2 średnie, 3 małe) kosztuje 120 zł. Minimalne zamówienie to 100 zł." },
  { topic: "zamowienia", q: "Czy zrobisz pierniki w niestandardowym kształcie?", a: "Tak. Przy zamówieniach firmowych tworzę foremki pod konkretny projekt, więc piernik może mieć kształt Twojego logo, produktu czy budynku. Wystarczy opis albo zdjęcie inspiracji." },
  { topic: "zamowienia", q: "Do kiedy przyjmujesz zamówienia świąteczne?", a: "Zamówienia detaliczne na święta przyjmuję do 18 grudnia, a firmowe najpóźniej dwa tygodnie przed odbiorem. W szczycie sezonu terminy kończą się wcześniej, więc lepiej napisać zawczasu." },
  { topic: "zamowienia", q: "Jak dostanę pierniki?", a: "Możesz odebrać je osobiście w pracowni przy ul. Długiej 55 albo wysyłam je Paczkomatem: mała paczka 12 zł, duża 20 zł." },
  { topic: "zamowienia", q: "Jak długo pierniki są świeże?", a: "Udekorowane pierniki zachowują świeżość nawet 4–6 tygodni w szczelnym pudełku. Z czasem stają się coraz bardziej miękkie." },
];

export const gallery: GalleryItem[] = [
  { photo: "swieta-stol", shape: "tree", caption: "Świąteczny stół", category: "swieta", tile: 1, alt: "Piernikowe domki, misie i bałwanki rozłożone na drewnianym stole" },
  { photo: "kamieniczki", shape: "star", caption: "Kamieniczki na zamówienie", category: "okazje", tile: 2, alt: "Trzy piernikowe kamieniczki z lukrowymi wieńcami i złotymi detalami" },
  { photo: "swieta-mikolaj-domek", shape: "man", caption: "Mikołaj i domek", category: "swieta", tile: 3, alt: "Piernikowy Mikołaj i domek z czerwonymi drzwiami na różowym talerzu" },
  { photo: "wielkanoc", shape: "egg", caption: "Wielkanocne zajączki i kurczaki", category: "wielkanoc", tile: 4, alt: "Piernikowe zajączki, kurczaczki i kury w pastelowych kolorach" },
  { photo: "mis-choinka", shape: "heart", caption: "Miś i roześmiana choinka", category: "swieta", tile: 2, alt: "Piernikowy biały miś w szaliku i choinka z wesołą buzią" },
  { photo: "mis-mikolaj", shape: "star", caption: "Zestaw w czerwieni", category: "swieta", tile: 1, alt: "Piernikowy miś w czerwonym szaliku obok głowy Mikołaja" },
];
