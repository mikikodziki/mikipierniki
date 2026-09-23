import type { Season } from "./types";

export const site = {
  name: "Miki Pierniki",
  owner: "Dominika",
  tagline: "Warsztaty dekorowania pierników i pierniki na zamówienie",
  email: "dominika.saczynska@gmail.com",
  phone: "880 122 269",
  phoneHref: "tel:+48880122269",
  instagram: "https://instagram.com/mikipierniki",
  instagramHandle: "@mikipierniki",
  /** Studio where all open workshops take place */
  address: "ul. Długa 55",
  addressLocative: "ul. Długiej 55",
  city: "Wrocław",
  /** Gift card price in PLN */
  voucherPrice: 500,
  /** Group size on open workshops */
  groupMin: 4,
  groupMax: 10,
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
