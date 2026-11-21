/**
 * Data access for pages and client scripts.
 * - Static content (FAQ, gallery, testimonials, venues) is read at build time from mock-data.ts.
 * - Workshop terms live in the database: server-rendered pages read them via src/server/terms.ts.
 * - The write functions below run in the browser and post to the /api endpoints.
 */
import { faq, gallery, testimonials, venues } from "./mock-data";
import type {
  BookingRequest,
  BookingResult,
  FaqItem,
  GalleryItem,
  InquiryRequest,
  InterestRequest,
  Term,
  Testimonial,
  Venue,
} from "./types";

/* ---------- build-time reads ---------- */

export async function getVenues(): Promise<Venue[]> {
  return venues;
}

export function venueById(id: string): Venue {
  const v = venues.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown venue: ${id}`);
  return v;
}

export async function getTestimonials(): Promise<Testimonial[]> {
  return testimonials;
}

export async function getFaq(topic?: FaqItem["topic"]): Promise<FaqItem[]> {
  return topic ? faq.filter((f) => f.topic === topic) : faq;
}

export async function getGallery(): Promise<GalleryItem[]> {
  return gallery;
}

/** Photos a term card can use (the panel offers these), with their alt text. */
export function termPhotos(): { photo: string; alt: string; caption: string; category: GalleryItem["category"] }[] {
  const seen = new Set<string>();
  return gallery.flatMap((g) =>
    g.photo && !seen.has(g.photo) && seen.add(g.photo) ? [{ photo: g.photo, alt: g.alt, caption: g.caption, category: g.category }] : [],
  );
}

/** Gallery categories in the order the gallery filters show them (the panel's photo picker uses the same groups) */
export const galleryCategories: { value: GalleryItem["category"]; label: string }[] = [
  { value: "swieta", label: "Święta" },
  { value: "wielkanoc", label: "Wielkanoc" },
  { value: "halloween", label: "Halloween" },
  { value: "okazje", label: "Okazje" },
];

/* ---------- pricing (shared by UI and backend) ---------- */

export function bookingTotal(term: Pick<Term, "price">, people: number): number {
  return people * term.price;
}

/* ---------- booking window (shared by UI and backend) ---------- */

/** Online booking closes this many hours before a term starts. */
export const BOOKING_CLOSES_HOURS_BEFORE = 48;

/** True once less than 48 hours are left before the term starts (or it has started). */
export function bookingClosed(term: Pick<Term, "startsAt">, now = Date.now()): boolean {
  return new Date(term.startsAt).getTime() - now < BOOKING_CLOSES_HOURS_BEFORE * 60 * 60 * 1000;
}

/* ---------- client-side writes ---------- */

/** The server's own message, safe to show next to the form. */
export class ApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : "Nie udało się wysłać formularza.");
  return data as T;
}

/** `website` is the hidden honeypot field; people leave it empty. */
type WithHoneypot<T> = T & { website?: string };

export function createBooking(req: WithHoneypot<BookingRequest>): Promise<BookingResult> {
  return post("/api/rezerwacja", req);
}

export function registerInterest(req: WithHoneypot<InterestRequest>): Promise<{ terms: number }> {
  return post("/api/zainteresowanie", req);
}

export function sendInquiry(req: WithHoneypot<InquiryRequest>): Promise<{ ok: true }> {
  return post("/api/zapytanie", req);
}

export function subscribeNewsletter(email: string, website?: string): Promise<{ ok: true }> {
  return post("/api/newsletter", { email, website });
}
