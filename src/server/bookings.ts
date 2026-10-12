/**
 * Bookings on open terms. Payment is a bank transfer or a gift card for now; Dominika marks
 * bookings as paid in the panel. Seats count bookings that are confirmed or awaiting payment.
 */
import { bookingTotal } from "@/lib/api";
import { plural, seatsWord } from "@/lib/format";
import type { BookingRequest, BookingResult, BookingStatus, Term } from "@/lib/types";
import { bookingBlockers } from "./config";
import { getDb, nowIso, tx } from "./db";
import {
  bookingAwaitingTransfer, bookingCancelled, bookingConfirmed, bookingNotify, bookingReminder, bookingVoucher, bookingWaitlist,
  type BookingMailData, when,
} from "./emails";
import { UserError } from "./http";
import { enqueue } from "./mail";
import { getTerm } from "./terms";
import { bookingRef, normalizeEmail } from "./util";

const PAYMENT_DAYS = 3;
const dueDate = () => new Date(Date.now() + PAYMENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

export interface BookingRow {
  id: string; term_id: string; status: BookingStatus; name: string; email: string; phone: string; people: number;
  guardians: number | null; notes: string | null; payment: "przelew" | "voucher"; voucher_code: string | null; total: number;
  created_at: string; payment_due_at: string | null; paid_at: string | null; cancelled_at: string | null; reminded_at: string | null;
}

const mailData = (b: BookingRow): BookingMailData => ({
  id: b.id, name: b.name, email: b.email, phone: b.phone, people: b.people, guardians: b.guardians, notes: b.notes,
  payment: b.payment, voucherCode: b.voucher_code, total: b.total,
});

function seatsTaken(termId: string): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(people), 0) AS n FROM bookings WHERE term_id = ? AND status IN ('awaiting_payment','confirmed')")
    .get(termId) as { n: number };
  return r.n;
}

export function createBooking(req: BookingRequest): BookingResult {
  const term = getTerm(req.termId);
  if (!term || term.status !== "open" || new Date(term.startsAt).getTime() <= Date.now()) {
    throw new UserError("Ten termin nie przyjmuje już zapisów. Odśwież stronę i wybierz inny.", 409);
  }
  if (bookingBlockers().length) {
    throw new UserError("Zapisy chwilowo nie działają. Napisz do mnie albo zadzwoń, a zarezerwuję miejsce ręcznie.", 503);
  }
  if (req.people > term.capacity) throw new UserError(`Na jeden termin mogę przyjąć najwyżej ${term.capacity} osób.`);

  const db = getDb();
  const row = tx(db, () => {
    const left = term.capacity - seatsTaken(term.id);
    let status: BookingStatus;
    if (left <= 0) status = "waitlist";
    else if (req.people > left) throw new UserError(`Na ten termin ${plural(left, "zostało", "zostały", "zostało")} ${left} ${seatsWord(left)}. Zmniejsz liczbę osób albo wybierz inny termin.`, 409);
    else status = "awaiting_payment";

    let id = bookingRef();
    while (db.prepare("SELECT 1 FROM bookings WHERE id = ?").get(id)) id = bookingRef();
    // the waitlist hides the payment choice, so whoever gets a place later pays by transfer unless they say otherwise
    const payment = status === "waitlist" ? "przelew" : req.payment;
    const b: BookingRow = {
      id, term_id: term.id, status, name: req.name, email: normalizeEmail(req.email), phone: req.phone, people: req.people,
      guardians: term.type === "dzieci" ? (req.guardians ?? 0) : null, notes: req.notes ?? null, payment,
      voucher_code: payment === "voucher" ? (req.voucherCode ?? null) : null, total: bookingTotal(term, req.people),
      created_at: nowIso(), payment_due_at: status === "awaiting_payment" && payment === "przelew" ? dueDate() : null,
      paid_at: null, cancelled_at: null, reminded_at: null,
    };
    db.prepare(`INSERT INTO bookings (id, term_id, status, name, email, phone, people, guardians, notes, payment, voucher_code, total, created_at, payment_due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(b.id, b.term_id, b.status, b.name, b.email, b.phone, b.people, b.guardians, b.notes, b.payment, b.voucher_code, b.total, b.created_at, b.payment_due_at);
    const d = mailData(b);
    enqueue(
      status === "waitlist" ? bookingWaitlist(d, term) : payment === "voucher" ? bookingVoucher(d, term) : bookingAwaitingTransfer(d, term),
      bookingNotify(d, term, status),
    );
    return b;
  });
  return { bookingId: row.id, status: row.status, total: row.total };
}

export function bookingsForTerm(termId: string): BookingRow[] {
  return getDb().prepare("SELECT * FROM bookings WHERE term_id = ? ORDER BY created_at").all(termId) as unknown as BookingRow[];
}

function load(id: string): { b: BookingRow; t: Term } {
  const b = getDb().prepare("SELECT * FROM bookings WHERE id = ?").get(id) as unknown as BookingRow | undefined;
  const t = b && getTerm(b.term_id);
  if (!b || !t) throw new UserError("Nie ma takiej rezerwacji.", 404);
  return { b, t };
}

/** Transfer arrived or the voucher checks out: confirm and send the address. */
export function markPaid(id: string): void {
  const db = getDb();
  tx(db, () => {
    const { b, t } = load(id);
    if (b.status !== "awaiting_payment") throw new UserError("Tę rezerwację można potwierdzić tylko, gdy czeka na wpłatę.");
    db.prepare("UPDATE bookings SET status = 'confirmed', paid_at = ? WHERE id = ?").run(nowIso(), id);
    enqueue(bookingConfirmed(mailData(b), t));
  });
}

/** Offers a freed seat to someone on the waitlist: they get transfer details and 3 days to pay. */
export function admitFromWaitlist(id: string): void {
  const db = getDb();
  tx(db, () => {
    const { b, t } = load(id);
    if (b.status !== "waitlist") throw new UserError("Ta osoba nie jest na liście rezerwowej.");
    const left = t.capacity - seatsTaken(t.id);
    if (left < b.people) throw new UserError(`Wolnych miejsc: ${left}, a ta rezerwacja potrzebuje ${b.people}.`);
    db.prepare("UPDATE bookings SET status = 'awaiting_payment', payment_due_at = ? WHERE id = ?").run(dueDate(), id);
    enqueue(bookingAwaitingTransfer(mailData(b), t, `zwolniło się miejsce na warsztatach ${when(t)}! Rezerwacja czeka na Ciebie.`));
  });
}

export function cancelBooking(id: string, notify: boolean): void {
  const db = getDb();
  tx(db, () => {
    const { b, t } = load(id);
    if (b.status === "cancelled") return;
    db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(nowIso(), id);
    if (notify) enqueue(bookingCancelled(mailData(b), t, "single"));
  });
}

/** Called when a whole term is cancelled. */
export function cancelAllForTerm(termId: string, t: Term): number {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM bookings WHERE term_id = ? AND status != 'cancelled'").all(termId) as unknown as BookingRow[];
  const upd = db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?");
  for (const b of rows) {
    upd.run(nowIso(), b.id);
    enqueue(bookingCancelled(mailData(b), t, "term"));
  }
  return rows.length;
}

/** Day-before reminders for confirmed bookings (run by the background tick). */
export function sendReminders(): number {
  const db = getDb();
  const rows = db.prepare(`SELECT b.* FROM bookings b JOIN terms t ON t.id = b.term_id
    WHERE b.status = 'confirmed' AND b.reminded_at IS NULL AND t.status = 'open'`).all() as unknown as BookingRow[];
  const now = Date.now();
  let sent = 0;
  for (const b of rows) {
    const t = getTerm(b.term_id)!;
    const until = new Date(t.startsAt).getTime() - now;
    // within 30 hours of the start (and not already started): the evening before for morning workshops
    if (until > 0 && until <= 30 * 60 * 60 * 1000) {
      tx(db, () => {
        enqueue(bookingReminder(mailData(b), t));
        db.prepare("UPDATE bookings SET reminded_at = ? WHERE id = ?").run(nowIso(), b.id);
      });
      sent++;
    }
  }
  return sent;
}
