/**
 * Data contract shared by the frontend and the future booking backend
 * (Supabase + Stripe). Pages only talk to `src/lib/api.ts`, never to mocks directly.
 */

export type Season = "swieta" | "wielkanoc" | "rok";

export type WorkshopType = "dorosli" | "rodzinne" | "wieczor";

export interface Term {
  id: string;
  type: WorkshopType;
  title: string;
  /** ISO 8601 with offset, e.g. 2026-11-14T11:00:00+01:00 */
  startsAt: string;
  endsAt: string;
  venueId: string;
  /** Price per adult in PLN (whole złoty) */
  price: number;
  /** Price per child in PLN; only for family workshops */
  kidPrice?: number;
  capacity: number;
  seatsLeft: number;
  /** Number of gingerbread cookies each participant takes home */
  cookies: number;
  season: Season;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  mapUrl?: string;
}

export type PaymentMethod = "online" | "przelew";

export interface BookingRequest {
  termId: string;
  adults: number;
  kids: number;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  payment: PaymentMethod;
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
  /** Real photo path under /public once available */
  src?: string;
  alt: string;
}
