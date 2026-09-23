/**
 * Data contract shared by the frontend and the future booking backend
 * (Supabase + Stripe). Pages only talk to `src/lib/api.ts`, never to mocks directly.
 */

export type Season = "swieta" | "wielkanoc" | "rok";

export type WorkshopType = "dorosli" | "dzieci" | "wieczor";

export interface Term {
  id: string;
  type: WorkshopType;
  title: string;
  /** ISO 8601 with offset, e.g. 2026-11-14T11:00:00+01:00 */
  startsAt: string;
  endsAt: string;
  venueId: string;
  /** Price per participant in PLN (whole złoty) */
  price: number;
  /** What one paid place means: an adult seat or a child's seat */
  priceUnit: "osoba" | "dziecko";
  capacity: number;
  seatsLeft: number;
  /** How many cookies a participant decorates and takes home, e.g. "6–8" */
  cookies: string;
  season: Season;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  mapUrl?: string;
  /** Locative form for Polish prose: "przy ul. Długiej 55" */
  addressLocative?: string;
  /** True while the address is not settled yet: pages hide the address and the map */
  addressPending?: boolean;
}

export type PaymentMethod = "online" | "przelew" | "voucher";

export interface BookingRequest {
  termId: string;
  /** Number of paid places (adults, or children on a children's workshop) */
  people: number;
  /** Adults coming along on a children's workshop; they don't pay */
  guardians?: number;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  payment: PaymentMethod;
  /** Gift card code when payment === "voucher" */
  voucherCode?: string;
  acceptedTerms: true;
}

export type BookingStatus = "confirmed" | "awaiting_payment" | "waitlist";

export interface BookingResult {
  bookingId: string;
  status: BookingStatus;
  total: number;
  /** Stripe Checkout URL when payment === "online" */
  checkoutUrl?: string;
}

export type InquiryKind = "zamowienie" | "warsztaty-zamkniete" | "voucher" | "kontakt";

export interface InquiryRequest {
  kind: InquiryKind;
  name: string;
  email: string;
  phone?: string;
  message: string;
  /** Free-form extra fields: occasion, quantity, date, group size... */
  details?: Record<string, string>;
}

export interface Testimonial {
  author: string;
  context: string;
  text: string;
}

export interface FaqItem {
  q: string;
  a: string;
  topic: "warsztaty" | "zamowienia" | "platnosci";
}

export type CookieShape = "star" | "heart" | "man" | "tree" | "egg" | "pumpkin";

export interface GalleryItem {
  shape: CookieShape;
  caption: string;
  category: "warsztaty" | "swieta" | "wielkanoc" | "okazje";
  tile: 1 | 2 | 3 | 4;
  /** File stem in /public/zdjecia (without size suffix), when a real photo exists */
  photo?: string;
  alt: string;
}
