import type { Season, Term, WorkshopType } from "./types";

export const site = {
  name: "Miki Pierniki",
  owner: "Dominika",
  tagline: "Warsztaty lukrowania pierników i pierniki na zamówienie",
  email: "mika@mikipierniki.pl",
  phone: "880 122 269",
  phoneHref: "tel:+48880122269",
  instagram: "https://instagram.com/mikipierniki",
  instagramHandle: "@mikipierniki",
  city: "Wrocław",
  /** Gift card price in PLN */
  voucherPrice: 500,
  /** Group size on open workshops */
  groupMin: 4,
  groupMax: 10,
  /** Most people (or children) one booking or date pick may cover; larger groups go to closed workshops */
  bookingMax: 5,
  /** Closed (company / private) workshops: a full workshop for up to this many people; larger groups get shorter cycles */
  closedGroupMax: 12,
};

/**
 * Business data for the regulamin and the privacy policy, in one place. Values in [brackets] are
 * still placeholders; `npm run check:launch` lists them with everything else missing before launch.
 */
export const legal: {
  draft: boolean;
  owner: string;
  /** Registered business (JDG): name, registered address, NIP and REGON. Dominika has none yet
   *  (2026-11-20); once she registers, fill all four in and the regulamin, the privacy policy and
   *  the invoice lines show them. Her decision: the studio address is not printed in either
   *  document, it goes only into the booking e-mails. */
  business: string | null;
  address: string | null;
  nip: string | null;
  regon: string | null;
  hosting: string;
  /** Where the nightly database backups are kept (S3 in Stockholm, see deploy/README.md) */
  backups: string;
  /** Accounting office, if there is one; listed among the data recipients */
  accounting: string | null;
  /** Latest notice, in days, when a term is cancelled for too few people */
  lowTurnoutNoticeDays: string;
  regulaminFrom: string;
  privacyFrom: string;
} = {
  /** Until a lawyer has read both documents: shows the "Wersja robocza" note on them */
  draft: true,
  owner: "Dominika Saczyńska",
  business: null,
  address: null,
  nip: null,
  regon: null,
  hosting: "SEOHOST Sp. z o.o., ul. Obornicka 330, 60-689 Poznań",
  backups: "Amazon Web Services EMEA SARL, 38 Avenue John F. Kennedy, L-1855 Luksemburg",
  accounting: null,
  lowTurnoutNoticeDays: "7",
  // the day the site goes live
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
