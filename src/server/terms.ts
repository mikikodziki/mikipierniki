/**
 * Workshop terms live in the database and are managed in /panel.
 * Server-rendered pages (/, /warsztaty) read them from here.
 */
import { seasonFor } from "@/lib/site";
import type { Term, TermStatus, WorkshopType } from "@/lib/types";
import { getDb, nowIso } from "./db";

interface TermRow {
  id: string; status: TermStatus; type: WorkshopType; title: string; starts_at: string; ends_at: string;
  venue_id: string; price: number; price_unit: "osoba" | "dziecko"; capacity: number; cookies: string;
  photo: string; photo_alt: string; taken: number;
}

const SELECT = `
  SELECT t.*, COALESCE((SELECT SUM(b.people) FROM bookings b
    WHERE b.term_id = t.id AND b.status IN ('awaiting_payment','confirmed')), 0) AS taken
  FROM terms t`;

function toTerm(r: TermRow): Term {
  return {
    id: r.id, status: r.status, type: r.type, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at,
    venueId: r.venue_id, price: r.price, priceUnit: r.price_unit, capacity: r.capacity,
    seatsLeft: Math.max(0, r.capacity - r.taken), cookies: r.cookies, photo: r.photo, photoAlt: r.photo_alt,
    season: seasonFor(new Date(r.starts_at)),
  };
}

/** Upcoming proposed and open terms, soonest first. */
export function publicTerms(opts: { type?: WorkshopType } = {}): Term[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE t.status IN ('proposed','open') ORDER BY t.starts_at`)
    .all() as unknown as TermRow[];
  // starts_at carries a +01:00/+02:00 offset, so compare as instants rather than strings
  const now = Date.now();
  return rows
    .filter((r) => new Date(r.starts_at).getTime() > now && (!opts.type || r.type === opts.type))
    .map(toTerm);
}

export function getTerm(id: string): Term | undefined {
  const row = getDb().prepare(`${SELECT} WHERE t.id = ?`).get(id) as unknown as TermRow | undefined;
  return row ? toTerm(row) : undefined;
}

export interface PanelTerm extends Term {
  /** Sum of people over active interest sign-ups */
  interestPeople: number;
  interestCount: number;
  /** Active interest sign-ups that haven't had the "date is open" e-mail yet */
  interestUnnotified: number;
  confirmed: number;
  awaiting: number;
  waitlist: number;
}

export function panelTerms(opts: { past?: boolean } = {}): PanelTerm[] {
  const db = getDb();
  const rows = db.prepare(`${SELECT} ORDER BY t.starts_at ${opts.past ? "DESC" : "ASC"}`).all() as unknown as TermRow[];
  const now = Date.now();
  const interest = db.prepare(`
    SELECT term_id, COUNT(*) AS n, SUM(people) AS people, SUM(notified_at IS NULL) AS unnotified
    FROM interest WHERE withdrawn_at IS NULL GROUP BY term_id`).all() as unknown as { term_id: string; n: number; people: number; unnotified: number }[];
  const bookings = db.prepare(`
    SELECT term_id, status, SUM(people) AS people FROM bookings WHERE status != 'cancelled' GROUP BY term_id, status`)
    .all() as unknown as { term_id: string; status: string; people: number }[];
  return rows
    .filter((r) => (new Date(r.starts_at).getTime() < now) === !!opts.past)
    .map((r) => {
      const i = interest.find((x) => x.term_id === r.id);
      const b = (s: string) => bookings.find((x) => x.term_id === r.id && x.status === s)?.people ?? 0;
      return {
        ...toTerm(r),
        interestPeople: i?.people ?? 0, interestCount: i?.n ?? 0, interestUnnotified: i?.unnotified ?? 0,
        confirmed: b("confirmed"), awaiting: b("awaiting_payment"), waitlist: b("waitlist"),
      };
    });
}

export interface TermInput {
  type: WorkshopType; title: string; startsAt: string; endsAt: string; price: number;
  priceUnit: "osoba" | "dziecko"; capacity: number; cookies: string; photo: string; photoAlt: string;
}

export function createTerm(input: TermInput, status: TermStatus): string {
  const db = getDb();
  // readable ids: t-2026-11-14-1100, with a suffix if two workshops start at the same minute
  const base = `t-${input.startsAt.slice(0, 10)}-${input.startsAt.slice(11, 16).replace(":", "")}`;
  let id = base;
  for (let n = 2; db.prepare("SELECT 1 FROM terms WHERE id = ?").get(id); n++) id = `${base}-${n}`;
  const now = nowIso();
  db.prepare(`INSERT INTO terms (id, status, type, title, starts_at, ends_at, price, price_unit, capacity, cookies, photo, photo_alt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, status, input.type, input.title, input.startsAt, input.endsAt, input.price, input.priceUnit, input.capacity, input.cookies, input.photo, input.photoAlt, now, now);
  return id;
}

export function updateTerm(id: string, input: TermInput): void {
  getDb().prepare(`UPDATE terms SET type = ?, title = ?, starts_at = ?, ends_at = ?, price = ?, price_unit = ?, capacity = ?,
    cookies = ?, photo = ?, photo_alt = ?, updated_at = ? WHERE id = ?`)
    .run(input.type, input.title, input.startsAt, input.endsAt, input.price, input.priceUnit, input.capacity, input.cookies, input.photo, input.photoAlt, nowIso(), id);
}

export function setTermStatus(id: string, status: TermStatus): void {
  getDb().prepare("UPDATE terms SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
}

/** Only a term nobody has signed up for can be deleted; otherwise it is cancelled. */
export function deleteTerm(id: string): boolean {
  const db = getDb();
  const used = db.prepare("SELECT (SELECT COUNT(*) FROM interest WHERE term_id = ?) + (SELECT COUNT(*) FROM bookings WHERE term_id = ?) AS n")
    .get(id, id) as { n: number };
  if (used.n > 0) return false;
  db.prepare("DELETE FROM terms WHERE id = ?").run(id);
  return true;
}
