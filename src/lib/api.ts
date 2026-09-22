/**
 * The only data access layer pages and components use.
 * Today it serves mock data; later the same signatures are backed by
 * Supabase (reads) and serverless endpoints (bookings, inquiries).
 */
import { faq, gallery, terms, testimonials, venues } from "./mock-data";
import type {
  BookingRequest,
  BookingResult,
  FaqItem,
  GalleryItem,
  InquiryRequest,
  Term,
  Testimonial,
  Venue,
  WorkshopType,
} from "./types";

/* ---------- build-time reads ---------- */

export async function getTerms(opts: { type?: WorkshopType; limit?: number } = {}): Promise<Term[]> {
  const list = terms
    .filter((t) => !opts.type || t.type === opts.type)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return opts.limit ? list.slice(0, opts.limit) : list;
}

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

/* ---------- pricing (shared by UI and backend) ---------- */

export function bookingTotal(term: Pick<Term, "price" | "kidPrice">, adults: number, kids: number): number {
  return adults * term.price + kids * (term.kidPrice ?? term.price);
}

/* ---------- client-side writes (mocked) ---------- */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function createBooking(req: BookingRequest, term: Term): Promise<BookingResult> {
  await wait(600);
  const total = bookingTotal(term, req.adults, req.kids);
  const bookingId = `mock-${Date.now().toString(36)}`;
  if (term.seatsLeft < req.adults + req.kids) return { bookingId, status: "waitlist", total };
  return { bookingId, status: req.payment === "online" ? "confirmed" : "awaiting_payment", total };
}

export async function sendInquiry(_req: InquiryRequest): Promise<{ ok: true }> {
  await wait(600);
  return { ok: true };
}

export async function subscribeNewsletter(_email: string): Promise<{ ok: true }> {
  await wait(400);
  return { ok: true };
}
