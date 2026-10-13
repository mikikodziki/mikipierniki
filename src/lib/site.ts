import type { Season, Term, WorkshopType } from "./types";

export const site = {
  name: "Miki Pierniki",
  owner: "Dominika",
  tagline: "Warsztaty dekorowania pierników i pierniki na zamówienie",
  email: "dominika.saczynska@gmail.com",
  phone: "880 122 269",
  phoneHref: "tel:+48880122269",
  instagram: "https://instagram.com/mikipierniki",
  instagramHandle: "@mikipierniki",
  /** The street address is deliberately not published; only the city is */
  city: "Wrocław",
  /** Gift card price in PLN */
  voucherPrice: 500,
  /** Group size on open workshops */
  groupMin: 4,
  groupMax: 10,
};

/**
 * Business data for the regulamin and the privacy policy, in one place. Values in [brackets] are
 * still placeholders; `npm run check:launch` lists them with everything else missing before launch.
 * Before filling `address`: if the registered business address is the studio, ask Dominika first,
 * because the studio street address is otherwise never published (only sent in confirmations).
 */
export const legal = {
  /** Until a lawyer has read both documents: shows the "Wersja robocza" note on them */
  draft: true,
  owner: "[imię i nazwisko]",
  business: "[nazwa działalności]",
  address: "[adres siedziby]",
  nip: "[NIP]",
  regon: "[REGON]",
  hosting: "seohost.pl [pełna nazwa firmy i adres]",
  accounting: "[nazwa biura rachunkowego]",
  /** Latest notice, in days, when a term is cancelled for too few people */
  lowTurnoutNoticeDays: "[liczba]",
  regulaminFrom: "[data]",
  privacyFrom: "[data]",
};

/** Prices and usual hours per workshop type (docs/dane.md); the panel fills new terms with these. */
export const workshopDefaults: Record<WorkshopType, Pick<Term, "price" | "priceUnit" | "cookies"> & { start: string; end: string }> = {
  dorosli: { price: 450, priceUnit: "osoba", cookies: "6–8", start: "11:00", end: "15:00" },
  wieczor: { price: 500, priceUnit: "osoba", cookies: "6–8", start: "18:00", end: "21:30" },
  dzieci: { price: 200, priceUnit: "dziecko", cookies: "6–8", start: "10:00", end: "12:00" },
};

export const nav = [
  { href: "/warsztaty", label: "Warsztaty" },
  { href: "/zamowienia", label: "Na zamówienie" },
  { href: "/galeria", label: "Galeria" },
  { href: "/o-mnie", label: "O mnie" },
  { href: "/faq", label: "FAQ" },
  { href: "/kontakt", label: "Kontakt" },
];

/**
 * Seasonal calendar (month is 1–12, inclusive ranges).
 * The inline script in Base.astro mirrors this logic so the season
 * follows the visitor's date without a rebuild. Preview any season with ?sezon=wielkanoc.
 */
export const seasonRanges: { season: Season; from: [number, number]; to: [number, number] }[] = [
  { season: "rok", from: [1, 1], to: [2, 28] },
  { season: "wielkanoc", from: [3, 1], to: [4, 30] },
  { season: "rok", from: [5, 1], to: [9, 14] },
  { season: "swieta", from: [9, 15], to: [12, 31] },
];

export function seasonFor(date: Date): Season {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const hit = seasonRanges.find((r) => md >= r.from[0] * 100 + r.from[1] && md <= r.to[0] * 100 + r.to[1]);
  return hit?.season ?? "rok";
}
