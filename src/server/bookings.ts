/**
 * Bookings on open terms. Payment is a bank transfer or a gift card for now; Dominika marks
 * bookings as paid in the panel. Seats count bookings that are confirmed or awaiting payment.
 */
import { bookingClosed, bookingTotal } from "@/lib/api";
import { plural, seatsWord } from "@/lib/format";
import type { BookingRequest, BookingResult, BookingStatus, Term } from "@/lib/types";
import { bookingBlockers } from "./config";
import { getDb, nowIso, tx } from "./db";
import {
  bookingAwaitingTransfer, bookingCancelled, bookingChanged, bookingConfirmed, bookingNotify, bookingOverdue, bookingReminder, bookingVoucher, bookingWaitlist,
  type BookingMailData, whenInText,
} from "./emails";
import { UserError } from "./http";
import { enqueue } from "./mail";
import { getTerm } from "./terms";
import { bookingRef, normalizeEmail } from "./util";

const HOUR = 60 * 60 * 1000;
const PAYMENT_DAYS = 3;
/** Transfers are due 3 days after the booking, but no later than the day before the workshop. */
const dueDate = (t: Pick<Term, "startsAt">) =>
  new Date(Math.min(Date.now() + PAYMENT_DAYS * 24 * HOUR, new Date(t.startsAt).getTime() - 24 * HOUR)).toISOString();
/** Least time to pay a seat freed close to the workshop, when the day-before deadline has passed or is near. */
const LATE_ADMIT_HOURS = 12;
/**
 * A seat offered from the waitlist, or booked or moved in the panel close to the start: the usual deadline,
 * but never one that has passed or is minutes away (and never after the start).
 */
const admitDueDate = (t: Pick<Term, "startsAt">) => {
  const floor = Math.min(Date.now() + LATE_ADMIT_HOURS * HOUR, new Date(t.startsAt).getTime());
  return new Date(Math.max(new Date(dueDate(t)).getTime(), floor)).toISOString();
};

export interface BookingRow {
  id: string; term_id: string; status: BookingStatus; name: string; email: string; phone: string; people: number;
  guardians: number | null; notes: string | null; payment: "przelew" | "voucher"; voucher_code: string | null; total: number;
  created_at: string; payment_due_at: string | null; paid_at: string | null; cancelled_at: string | null; reminded_at: string | null;
  overdue_notified_at?: string | null;
}

const mailData = (b: BookingRow): BookingMailData => ({
  id: b.id, name: b.name, email: b.email, phone: b.phone, people: b.people, guardians: b.guardians, notes: b.notes,
  payment: b.payment, voucherCode: b.voucher_code, total: b.total, paymentDueAt: b.payment_due_at,
});

/** Seats held on a term; `except` leaves out a booking being changed, so it doesn't compete with itself. */
function seatsTaken(termId: string, except = ""): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(people), 0) AS n FROM bookings WHERE term_id = ? AND id != ? AND status IN ('awaiting_payment','confirmed')")
    .get(termId, except) as { n: number };
  return r.n;
}

/** What a new booking needs; the online form also sends its consents, which aren't stored with it. */
export type NewBooking = Omit<BookingRequest, "acceptedTerms" | "newsletter">;

/** A booking Dominika enters in the panel, taken by phone or e-mail. */
export interface PanelAdd {
  /** Already paid: confirmed at once, and the confirmation is its first e-mail */
  paid: boolean;
  /** Send the customer the usual first e-mail */
  notify: boolean;
}

export function createBooking(req: NewBooking, panel?: PanelAdd): BookingResult {
  const term = getTerm(req.termId);
  if (!term || term.status !== "open" || new Date(term.startsAt).getTime() <= Date.now()) {
    throw new UserError("Ten termin nie przyjmuje już zapisów. Odśwież stronę i wybierz inny.", 409);
  }
  // by phone she can still fit someone in after online booking has closed
  if (!panel && bookingClosed(term)) {
    throw new UserError("Zapisy online na ten termin są już zamknięte. Zadzwoń do mnie, może znajdzie się miejsce.", 409);
  }
  if (panel && bookingBlockers().length) throw new UserError(`Zanim dodasz rezerwację, uzupełnij na serwerze: ${bookingBlockers().join(", ")}.`, 503);
  if (bookingBlockers().length) {
    throw new UserError("Zapisy chwilowo nie działają. Napisz do mnie albo zadzwoń, a zarezerwuję miejsce ręcznie.", 503);
  }
  if (req.people > term.capacity) throw new UserError(`Na jeden termin mogę przyjąć najwyżej ${term.capacity} osób.`);
  // the regulamin and the child-protection standards: a parent stays for the whole children's workshop
  if (term.type === "dzieci" && (req.guardians ?? 0) < 1) throw new UserError("Na warsztatach dla dzieci zostaje co najmniej jeden rodzic lub opiekun.");

  const db = getDb();
  const email = normalizeEmail(req.email);
  const row = tx(db, () => {
    // one active booking per person and term, so a single address can't hold the whole term
    const dup = db.prepare("SELECT id FROM bookings WHERE term_id = ? AND email = ? AND status != 'cancelled'").get(term.id, email);
    if (dup && panel) throw new UserError(`Ten adres ma już rezerwację na ten termin (${dup.id}). Popraw tamtą zamiast dodawać nową.`, 409);
    if (dup) throw new UserError("Masz już rezerwację na ten termin. Jeśli chcesz coś zmienić, odpisz na maila z potwierdzeniem.", 409);
    const left = term.capacity - seatsTaken(term.id);
    let status: BookingStatus;
    if (left <= 0) status = "waitlist";
    else if (req.people > left) throw new UserError(`Na ten termin ${plural(left, "zostało", "zostały", "zostało")} ${left} ${seatsWord(left)}. Zmniejsz liczbę osób albo wybierz inny termin.`, 409);
    else status = panel?.paid ? "confirmed" : "awaiting_payment";
    // nobody pays for a waitlist place: she frees a seat first, or saves it unpaid
    if (panel?.paid && status === "waitlist") throw new UserError("Termin jest pełny, więc ta rezerwacja trafi na listę rezerwową. Odznacz „już opłacona” albo najpierw zwolnij miejsce.", 409);

    let id = bookingRef();
    while (db.prepare("SELECT 1 FROM bookings WHERE id = ?").get(id)) id = bookingRef();
    // the waitlist hides the payment choice, so whoever gets a place later pays by transfer unless they say otherwise
    const payment = status === "waitlist" ? "przelew" : req.payment;
    const b: BookingRow = {
      id, term_id: term.id, status, name: req.name, email, phone: req.phone, people: req.people,
      guardians: term.type === "dzieci" ? (req.guardians ?? 0) : null, notes: req.notes ?? null, payment,
      voucher_code: payment === "voucher" ? (req.voucherCode ?? null) : null, total: bookingTotal(term, req.people),
      // in the panel's last 48 hours the day-before deadline may already have passed
      created_at: nowIso(), payment_due_at: status === "awaiting_payment" && payment === "przelew" ? (panel ? admitDueDate(term) : dueDate(term)) : null,
      paid_at: status === "confirmed" ? nowIso() : null, cancelled_at: null, reminded_at: null,
    };
    db.prepare(`INSERT INTO bookings (id, term_id, status, name, email, phone, people, guardians, notes, payment, voucher_code, total, created_at, payment_due_at, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(b.id, b.term_id, b.status, b.name, b.email, b.phone, b.people, b.guardians, b.notes, b.payment, b.voucher_code, b.total, b.created_at, b.payment_due_at, b.paid_at);
    const d = mailData(b);
    const first = status === "waitlist" ? bookingWaitlist(d, term) : status === "confirmed" ? bookingConfirmed(d, term)
      : payment === "voucher" ? bookingVoucher(d, term) : bookingAwaitingTransfer(d, term);
    // what she enters herself needs no notification to her
    if (!panel) enqueue(first, bookingNotify(d, term, status));
    else if (panel.notify) enqueue(first);
    return b;
  });
  return { bookingId: row.id, status: row.status, total: row.total };
}

export function bookingsForTerm(termId: string): BookingRow[] {
  return getDb().prepare("SELECT * FROM bookings WHERE term_id = ? ORDER BY created_at").all(termId) as unknown as BookingRow[];
}

/**
 * A booking on the term whose panel page sent the action. A page opened before the booking was moved
 * still lists it under the old term; acting from there must not move it back or touch another term.
 */
function load(id: string, onTerm: string): { b: BookingRow; t: Term } {
  const b = getDb().prepare("SELECT * FROM bookings WHERE id = ?").get(id) as unknown as BookingRow | undefined;
  const t = b && getTerm(b.term_id);
  if (!b || !t) throw new UserError("Nie ma takiej rezerwacji.", 404);
  if (b.term_id !== onTerm) throw new UserError(`Rezerwacja ${id} jest już na innym terminie. Odśwież stronę.`, 409);
  return { b, t };
}

/** Transfer arrived or the voucher checks out: confirm and send the address. */
export function markPaid(id: string, onTerm: string): void {
  const db = getDb();
  tx(db, () => {
    const { b, t } = load(id, onTerm);
    if (b.status !== "awaiting_payment") throw new UserError("Tę rezerwację można potwierdzić tylko, gdy czeka na wpłatę.");
    db.prepare("UPDATE bookings SET status = 'confirmed', paid_at = ? WHERE id = ?").run(nowIso(), id);
    enqueue(bookingConfirmed(mailData(b), t));
  });
}

/** Offers a freed seat to someone on the waitlist: they get transfer details and 3 days to pay. */
export function admitFromWaitlist(id: string, onTerm: string): void {
  const db = getDb();
  tx(db, () => {
    const { b, t } = load(id, onTerm);
    if (b.status !== "waitlist") throw new UserError("Ta osoba nie jest na liście rezerwowej.");
    if (new Date(t.startsAt).getTime() <= Date.now()) throw new UserError("Te warsztaty już się zaczęły.");
    const left = t.capacity - seatsTaken(t.id);
    if (left < b.people) throw new UserError(`Wolnych miejsc: ${left}, a ta rezerwacja potrzebuje ${b.people}.`);
    const due = admitDueDate(t);
    db.prepare("UPDATE bookings SET status = 'awaiting_payment', payment_due_at = ? WHERE id = ?").run(due, id);
    enqueue(bookingAwaitingTransfer({ ...mailData(b), paymentDueAt: due }, t, `zwolniło się miejsce na warsztatach ${whenInText(t)}! Rezerwacja czeka na Ciebie.`));
  });
}

export function cancelBooking(id: string, notify: boolean, onTerm: string): void {
  const db = getDb();
  tx(db, () => {
    const { b, t } = load(id, onTerm);
    if (b.status === "cancelled") return;
    db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(nowIso(), id);
    if (notify) enqueue(bookingCancelled(mailData(b), t, "single"));
  });
}

const started = (t: Term) => new Date(t.startsAt).getTime() <= Date.now();

/**
 * Drops unsent mail to the customer about a booking: pending, or failed and waiting for "Wyślij ponownie".
 * Every booking mail carries its number. Mail to Dominika stays, and so does a cancellation she chose to
 * send (`keepCancellation`), so deleting a cancelled booking doesn't leave the customer uninformed.
 */
function dropUnsentMail(b: BookingRow, keepCancellation = false): void {
  getDb().prepare(`DELETE FROM outbox WHERE status IN ('pending','failed') AND kind LIKE 'booking-%' AND to_addr = ? AND instr(text, ?) > 0
    ${keepCancellation ? "AND kind != 'booking-cancelled'" : ""}`).run(b.email, b.id);
}

/** What Dominika can correct in a booking, and the term it should be on. */
export interface BookingEdit {
  termId: string; name: string; email: string; phone: string; people: number; guardians?: number; notes?: string;
}

export interface EditResult {
  /** The term it was moved to, if it was */
  movedTo: Term | null;
  oldTotal: number;
  total: number;
  /** Paid before the change, so a different total is hers to settle */
  paid: boolean;
  /** A new payment deadline, when the edit set one */
  newDue: string | null;
  /** Moved off the waitlist onto a term with free seats; it now waits for payment */
  promoted: boolean;
}

/**
 * Corrects a booking reported wrong by phone or e-mail, or moves it to another open term. Seats and
 * the one-booking-per-address rule are checked as for a new booking, leaving the booking itself out.
 * Money is never settled here: a paid booking whose total changes is for Dominika to sort out.
 */
export function editBooking(id: string, onTerm: string, edit: BookingEdit, notify: boolean): EditResult {
  const db = getDb();
  return tx(db, () => {
    const { b, t: from } = load(id, onTerm);
    if (b.status === "cancelled") throw new UserError("Anulowanej rezerwacji nie można poprawić.");
    const moved = edit.termId !== b.term_id;
    const to = moved ? getTerm(edit.termId) : from;
    if (!to) throw new UserError("Nie ma takiego terminu.", 404);
    if (moved && (to.status !== "open" || started(to))) throw new UserError("Przenieść można tylko na termin z otwartymi zapisami, który jeszcze się nie zaczął.");
    if (edit.people > to.capacity) throw new UserError(`Ten termin ma tylko ${to.capacity} ${seatsWord(to.capacity)}.`);
    if (to.type === "dzieci" && (edit.guardians ?? 0) < 1) throw new UserError("Na warsztatach dla dzieci zostaje co najmniej jeden rodzic lub opiekun.");
    const email = normalizeEmail(edit.email);
    if (moved || email !== b.email) {
      const dup = db.prepare("SELECT id FROM bookings WHERE term_id = ? AND email = ? AND id != ? AND status != 'cancelled'").get(to.id, email, id);
      if (dup) throw new UserError(`Ten adres ma już rezerwację na ${moved ? whenInText(to) : "ten termin"} (${dup.id}).`, 409);
    }
    // a waitlist place holds no seat, so it moves without a seat check; on a term with enough free seats and
    // no waitlist of its own nobody is ahead of it, so it gets the seat the way "Daj miejsce" gives one
    const promoted = moved && b.status === "waitlist"
      && to.capacity - seatsTaken(to.id, id) >= edit.people
      && !db.prepare("SELECT 1 FROM bookings WHERE term_id = ? AND status = 'waitlist' AND id != ?").get(to.id, id);
    if (b.status !== "waitlist" && (moved || edit.people > b.people)) {
      const left = Math.max(0, to.capacity - seatsTaken(to.id, id));
      if (edit.people > left) {
        throw new UserError(moved
          ? `Na ${whenInText(to)} ${plural(left, "zostało", "zostały", "zostało")} ${left} ${seatsWord(left)}, a ta rezerwacja potrzebuje ${edit.people}.`
          : `Wolnych miejsc razem z tą rezerwacją: ${left}, a potrzeba ${edit.people}.`, 409);
      }
    }
    const readdressed = email !== b.email;
    const status: BookingStatus = promoted ? "awaiting_payment" : b.status;
    const transferDue = status === "awaiting_payment" && b.payment === "przelew";
    // a new date gets a deadline that fits it; a corrected address never got the transfer details, so it
    // gets a fresh deadline too (never an earlier one). A phone or name fix leaves an overdue booking overdue.
    const due = !transferDue ? b.payment_due_at
      : moved ? admitDueDate(to)
      : readdressed ? laterOf(b.payment_due_at, admitDueDate(to))
      : b.payment_due_at;
    const next: BookingRow = {
      ...b, term_id: to.id, status, name: edit.name, email, phone: edit.phone, people: edit.people,
      guardians: to.type === "dzieci" ? (edit.guardians ?? 1) : null, notes: edit.notes || null,
      // priced again only when what is bought changes: the term's price may have changed since the booking
      total: moved || edit.people !== b.people ? bookingTotal(to, edit.people) : b.total,
      payment_due_at: due,
      // a new date, or an address that never got it, needs its own reminder; a new deadline its own overdue notice
      reminded_at: moved || readdressed ? null : b.reminded_at,
      overdue_notified_at: due !== b.payment_due_at ? null : (b.overdue_notified_at ?? null),
    };
    db.prepare(`UPDATE bookings SET term_id = ?, status = ?, name = ?, email = ?, phone = ?, people = ?, guardians = ?, notes = ?, total = ?,
      payment_due_at = ?, reminded_at = ?, overdue_notified_at = ? WHERE id = ?`)
      .run(next.term_id, next.status, next.name, next.email, next.phone, next.people, next.guardians, next.notes, next.total,
        next.payment_due_at, next.reminded_at, next.overdue_notified_at ?? null, id);
    // what was queued for the old address or date must not go out later
    if (moved || readdressed) dropUnsentMail(b);
    if (notify) enqueue(bookingChanged(mailData(next), to, status, { moved, previousTotal: b.total }));
    return {
      movedTo: moved ? to : null, oldTotal: b.total, total: next.total, paid: !!b.paid_at,
      newDue: due !== b.payment_due_at ? due : null, promoted,
    };
  });
}

const laterOf = (a: string | null, b: string) => (a && new Date(a).getTime() > new Date(b).getTime() ? a : b);

/**
 * Removes a booking entered by mistake, with the mail still waiting to go out about it. Paid ones stay
 * in the accounts for 6 years (privacy policy, retention in tick.ts), so they can only be cancelled.
 */
export function deleteBooking(id: string, onTerm: string): void {
  const db = getDb();
  tx(db, () => {
    const { b } = load(id, onTerm);
    if (b.paid_at) throw new UserError(`Opłaconej rezerwacji nie da się usunąć: zostaje w rozliczeniach przez 6 lat.${b.status === "cancelled" ? "" : " Możesz ją anulować albo poprawić."}`);
    dropUnsentMail(b, true);
    db.prepare("DELETE FROM bookings WHERE id = ? AND paid_at IS NULL").run(id);
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

/**
 * Transfers past their 3-day deadline: Dominika gets one e-mail per booking and decides in the panel
 * (the terms say an unpaid booking *may* be cancelled, so nothing is cancelled automatically).
 */
export function notifyOverdue(): number {
  const db = getDb();
  const now = nowIso();
  const rows = db.prepare(`SELECT * FROM bookings WHERE status = 'awaiting_payment' AND payment = 'przelew'
    AND payment_due_at IS NOT NULL AND payment_due_at < ? AND overdue_notified_at IS NULL`).all(now) as unknown as BookingRow[];
  for (const b of rows) {
    const t = getTerm(b.term_id);
    if (!t) continue;
    tx(db, () => {
      enqueue(bookingOverdue(mailData(b), t));
      db.prepare("UPDATE bookings SET overdue_notified_at = ? WHERE id = ?").run(now, b.id);
    });
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
