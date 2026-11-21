/**
 * Business numbers for the statistics tab: per-term totals and monthly counts. Only sums: nothing
 * here matches people across tables. The clean-up deletes date picks and unpaid bookings 30 days
 * after a workshop, so just before that a term's totals are frozen and stay for later seasons.
 */
import type { DatabaseSync } from "node:sqlite";
import type { TermStatus, WorkshopType } from "@/lib/types";
import { getDb, nowIso } from "./db";

/** Recomputes the totals of every term that isn't frozen yet. */
export function refreshTermStats(db: DatabaseSync = getDb()): void {
  db.prepare(`
    INSERT INTO term_stats (term_id, interest_entries, interest_people, booked_people, paid_people, revenue, waitlist_people, cancelled_people, updated_at)
    SELECT t.id,
      (SELECT COUNT(*) FROM interest i WHERE i.term_id = t.id AND i.withdrawn_at IS NULL),
      (SELECT COALESCE(SUM(people), 0) FROM interest i WHERE i.term_id = t.id AND i.withdrawn_at IS NULL),
      (SELECT COALESCE(SUM(people), 0) FROM bookings b WHERE b.term_id = t.id AND b.status IN ('awaiting_payment', 'confirmed')),
      (SELECT COALESCE(SUM(people), 0) FROM bookings b WHERE b.term_id = t.id AND b.status = 'confirmed' AND b.paid_at IS NOT NULL),
      (SELECT COALESCE(SUM(total), 0) FROM bookings b WHERE b.term_id = t.id AND b.status = 'confirmed' AND b.paid_at IS NOT NULL),
      (SELECT COALESCE(SUM(people), 0) FROM bookings b WHERE b.term_id = t.id AND b.status = 'waitlist'),
      (SELECT COALESCE(SUM(people), 0) FROM bookings b WHERE b.term_id = t.id AND b.status = 'cancelled'),
      ?
    FROM terms t
    WHERE t.id NOT IN (SELECT term_id FROM term_stats WHERE frozen = 1)
    ON CONFLICT (term_id) DO UPDATE SET
      interest_entries = excluded.interest_entries, interest_people = excluded.interest_people,
      booked_people = excluded.booked_people, paid_people = excluded.paid_people, revenue = excluded.revenue,
      waitlist_people = excluded.waitlist_people, cancelled_people = excluded.cancelled_people, updated_at = excluded.updated_at
  `).run(nowIso());
}

/**
 * Takes the final totals of terms whose sign-ups are about to be deleted (call inside the clean-up).
 * A term nobody signed up for stays live, so a date typed in the past by mistake and corrected later
 * still counts the sign-ups that come after.
 */
export function freezeTermStats(db: DatabaseSync, termIds: string[]): void {
  if (!termIds.length) return;
  refreshTermStats(db);
  const freeze = db.prepare(`UPDATE term_stats SET frozen = 1 WHERE term_id = ?
    AND (EXISTS (SELECT 1 FROM interest WHERE term_id = ?) OR EXISTS (SELECT 1 FROM bookings WHERE term_id = ?))`);
  for (const id of termIds) freeze.run(id, id, id);
}

export interface TermStat {
  id: string;
  title: string;
  type: WorkshopType;
  status: TermStatus;
  startsAt: string;
  capacity: number;
  interestEntries: number;
  interestPeople: number;
  bookedPeople: number;
  paidPeople: number;
  revenue: number;
  waitlistPeople: number;
  cancelledPeople: number;
}

/** Terms starting on or after `from` (YYYY-MM-DD), newest first; all terms when null. Drafts are left out. */
export function termStats(from: string | null): TermStat[] {
  refreshTermStats();
  return getDb().prepare(`
    SELECT t.id, t.title, t.type, t.status, t.starts_at AS startsAt, t.capacity,
      s.interest_entries AS interestEntries, s.interest_people AS interestPeople, s.booked_people AS bookedPeople,
      s.paid_people AS paidPeople, s.revenue, s.waitlist_people AS waitlistPeople, s.cancelled_people AS cancelledPeople
    FROM terms t JOIN term_stats s ON s.term_id = t.id
    WHERE t.status != 'draft' AND substr(t.starts_at, 1, 10) >= ?
    ORDER BY t.starts_at DESC
  `).all(from ?? "0000-00-00") as unknown as TermStat[];
}

export interface MonthStat {
  month: string;
  /** forms sent from the site (stats_forms) */
  interest: number;
  bookings: number;
  inquiries: number;
  newsletter: number;
  /** newsletter consents confirmed and withdrawn (consent_log) */
  confirmed: number;
  unsubscribed: number;
}

/** One row per month with any activity, newest first. */
export function monthStats(): MonthStat[] {
  const db = getDb();
  const months = new Map<string, MonthStat>();
  const row = (month: string) => {
    let m = months.get(month);
    if (!m) months.set(month, (m = { month, interest: 0, bookings: 0, inquiries: 0, newsletter: 0, confirmed: 0, unsubscribed: 0 }));
    return m;
  };
  const forms = db.prepare(`SELECT substr(day, 1, 7) AS month, form, SUM(count) AS n FROM stats_forms WHERE outcome = 'wyslane'
    GROUP BY month, form`).all() as unknown as { month: string; form: string; n: number }[];
  const key: Record<string, "interest" | "bookings" | "inquiries" | "newsletter"> = {
    zainteresowanie: "interest", rezerwacja: "bookings", zapytanie: "inquiries", newsletter: "newsletter",
  };
  for (const f of forms) if (key[f.form]) row(f.month)[key[f.form]] += f.n;
  // consent dates are UTC instants; a month boundary may shift by an hour or two, which is fine here
  for (const [col, field] of [["confirmed_at", "confirmed"], ["unsubscribed_at", "unsubscribed"]] as const) {
    const rows = db.prepare(`SELECT substr(${col}, 1, 7) AS month, COUNT(*) AS n FROM consent_log WHERE ${col} IS NOT NULL GROUP BY month`)
      .all() as unknown as { month: string; n: number }[];
    for (const r of rows) row(r.month)[field] += r.n;
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** Newsletter subscribers right now */
export function subscriberCounts(): { active: number; pending: number } {
  const r = getDb().prepare(`SELECT
    (SELECT COUNT(*) FROM subscribers WHERE status = 'active') AS active,
    (SELECT COUNT(*) FROM subscribers WHERE status = 'pending') AS pending`).get() as { active: number; pending: number };
  return r;
}
