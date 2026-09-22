/**
 * EXAMPLE DATA. Dates, prices, venues and testimonials are placeholders
 * until Dominika provides the real 2026 schedule.
 */
import type { FaqItem, GalleryItem, Term, Testimonial, Venue } from "./types";

export const venues: Venue[] = [
  { id: "pracownia", name: "Pracownia Miki", address: "ul. Przykładowa 12", city: "Warszawa" },
  { id: "lukier", name: "Kawiarnia Lukier", address: "ul. Cukiernicza 5", city: "Warszawa" },
];

export const terms: Term[] = [
  { id: "t-2026-11-14", type: "dorosli", title: "Świąteczne klasyki", startsAt: "2026-11-14T11:00:00+01:00", endsAt: "2026-11-14T14:00:00+01:00", venueId: "pracownia", price: 189, capacity: 10, seatsLeft: 4, cookies: 12, season: "swieta" },
  { id: "t-2026-11-15", type: "rodzinne", title: "Pierniczki z dzieciakami", startsAt: "2026-11-15T10:00:00+01:00", endsAt: "2026-11-15T12:30:00+01:00", venueId: "pracownia", price: 149, kidPrice: 99, capacity: 12, seatsLeft: 7, cookies: 8, season: "swieta" },
  { id: "t-2026-11-20", type: "wieczor", title: "Lukier i grzane wino", startsAt: "2026-11-20T18:00:00+01:00", endsAt: "2026-11-20T21:00:00+01:00", venueId: "lukier", price: 219, capacity: 10, seatsLeft: 2, cookies: 10, season: "swieta" },
  { id: "t-2026-11-28", type: "dorosli", title: "Zawieszki na choinkę", startsAt: "2026-11-28T11:00:00+01:00", endsAt: "2026-11-28T14:00:00+01:00", venueId: "pracownia", price: 199, capacity: 10, seatsLeft: 0, cookies: 12, season: "swieta" },
  { id: "t-2026-11-29", type: "rodzinne", title: "Renifery i bałwanki", startsAt: "2026-11-29T10:00:00+01:00", endsAt: "2026-11-29T12:30:00+01:00", venueId: "pracownia", price: 149, kidPrice: 99, capacity: 12, seatsLeft: 12, cookies: 8, season: "swieta" },
  { id: "t-2026-12-04", type: "wieczor", title: "Pierniki i swing", startsAt: "2026-12-04T18:00:00+01:00", endsAt: "2026-12-04T21:00:00+01:00", venueId: "lukier", price: 219, capacity: 10, seatsLeft: 6, cookies: 10, season: "swieta" },
  { id: "t-2026-12-06", type: "rodzinne", title: "Mikołajkowe pierniki", startsAt: "2026-12-06T10:00:00+01:00", endsAt: "2026-12-06T12:30:00+01:00", venueId: "pracownia", price: 149, kidPrice: 99, capacity: 12, seatsLeft: 9, cookies: 8, season: "swieta" },
  { id: "t-2026-12-11", type: "wieczor", title: "Domki z piernika", startsAt: "2026-12-11T18:00:00+01:00", endsAt: "2026-12-11T21:30:00+01:00", venueId: "lukier", price: 249, capacity: 8, seatsLeft: 5, cookies: 1, season: "swieta" },
  { id: "t-2026-12-12", type: "dorosli", title: "Wianki i gwiazdy", startsAt: "2026-12-12T11:00:00+01:00", endsAt: "2026-12-12T14:00:00+01:00", venueId: "pracownia", price: 189, capacity: 10, seatsLeft: 3, cookies: 12, season: "swieta" },
];

export const testimonials: Testimonial[] = [
  { author: "Kasia", context: "warsztaty świąteczne", text: "Byłam pewna, że nic mi nie wyjdzie, a wyszłam z pudełkiem pierników, których szkoda było zjeść. Dominika tłumaczy wszystko spokojnie i z humorem." },
  { author: "Marek", context: "warsztaty firmowe", text: "Najlepsza przedświąteczna integracja, jaką mieliśmy. Cały zespół wciągnął się tak, że przedłużyliśmy o godzinę." },
  { author: "Agnieszka", context: "warsztaty rodzinne", text: "Byłyśmy z córką na warsztatach rodzinnych. Ona do dziś opowiada o swoim pierniczkowym reniferze." },
];

export const faq: FaqItem[] = [
  { topic: "warsztaty", q: "Czy muszę mieć jakieś doświadczenie?", a: "Nie. Warsztaty są prowadzone od podstaw, a większość uczestników pierwszy raz trzyma rękaw cukierniczy." },
  { topic: "warsztaty", q: "Od ilu lat dzieci mogą wziąć udział?", a: "Na warsztaty rodzinne zapraszam dzieci od 6 lat pod opieką rodzica. Każde dziecko to osobne miejsce." },
  { topic: "warsztaty", q: "Co mam ze sobą zabrać?", a: "Nic. Pierniki, lukier, rękawy, fartuch i pudełko na gotowe pierniki są w cenie." },
  { topic: "platnosci", q: "Co jeśli nie mogę przyjść?", a: "Do 7 dni przed terminem zwracam całą kwotę albo przenoszę rezerwację na inny termin. Później możesz przekazać miejsce innej osobie." },
  { topic: "platnosci", q: "Jak mogę zapłacić?", a: "Online przez BLIK lub kartą, albo zwykłym przelewem w ciągu 3 dni od rezerwacji. Na życzenie wystawiam fakturę." },
  { topic: "warsztaty", q: "Czy pierniki są odpowiednie dla alergików?", a: "Pierniki zawierają gluten i jajka i mogą zawierać śladowe ilości orzechów. Alergie wpisz w formularzu, a przygotuję się na miejscu." },
  { topic: "zamowienia", q: "Jak długo pierniki są świeże?", a: "Udekorowane pierniki zachowują świeżość nawet 4–6 tygodni w szczelnym pudełku. Z czasem stają się coraz bardziej miękkie." },
  { topic: "zamowienia", q: "Czy wysyłasz pierniki kurierem?", a: "Tak, pakuję je tak, żeby dojechały w całości. Przy większych zamówieniach firmowych możliwy jest też odbiór osobisty." },
];

export const gallery: GalleryItem[] = [
  { shape: "man", caption: "Z warsztatów", category: "warsztaty", tile: 1, alt: "Uczestniczka dekoruje piernikowego ludzika" },
  { shape: "tree", caption: "Zestaw świąteczny", category: "swieta", tile: 2, alt: "Pierniki w kształcie choinek w pudełku" },
  { shape: "heart", caption: "Walentynki", category: "okazje", tile: 3, alt: "Piernikowe serca z białym lukrem" },
  { shape: "egg", caption: "Wielkanoc", category: "wielkanoc", tile: 4, alt: "Piernikowe pisanki we wzory" },
  { shape: "star", caption: "Zawieszki na choinkę", category: "swieta", tile: 2, alt: "Piernikowe gwiazdki na wstążkach" },
  { shape: "pumpkin", caption: "Halloween", category: "okazje", tile: 4, alt: "Piernikowe dynie z uśmiechem" },
  { shape: "star", caption: "Warsztaty firmowe", category: "warsztaty", tile: 1, alt: "Stół pełen pierników podczas warsztatów firmowych" },
  { shape: "man", caption: "Urodziny", category: "okazje", tile: 3, alt: "Piernikowe ludziki z imionami gości" },
];
