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
export function termPhotos(): { photo: string; alt: string; caption: string }[] {
  const seen = new Set<string>();
  return gallery.flatMap((g) => (g.photo && !seen.has(g.photo) && seen.add(g.photo) ? [{ photo: g.photo, alt: g.alt, caption: g.caption }] : []));
}

/* ---------- pricing (shared by UI and backend) ---------- */

export function bookingTotal(term: Pick<Term, "price">, people: number): number {
  return people * term.price;
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
