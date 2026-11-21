/**
 * Interest in proposed dates: visitors tick the dates that suit them, Dominika sees the tally
 * in the panel, opens the winners and mails everyone who ticked them.
 */
import { z } from "astro/zod";
import { bookingClosed } from "@/lib/api";
import { site } from "@/lib/site";
import type { InterestRequest, Term } from "@/lib/types";
import { getDb, nowIso, tx } from "./db";
import { interestNotify, interestThanks, termOpened } from "./emails";
import { fields, UserError } from "./http";
import { enqueue, underHourlyCap } from "./mail";
import { getTerm } from "./terms";
import { normalizeEmail, token } from "./util";

/**
 * Adds the ticked dates for this address. The form has no login, so a row that already exists
 * is never touched: a stranger can't overwrite someone's name or phone, re-add a date they
 * withdrew from, or make the thank-you mail repeat. Only newly added dates are mailed, and the
 * answer is the same either way, so the form doesn't reveal who is on the list.
 */
export function registerInterest(req: InterestRequest): { terms: number } {
  const ids = [...new Set(req.termIds)];
  const terms = ids.map(getTerm).filter((t): t is Term => !!t && t.status === "proposed" && new Date(t.startsAt).getTime() > Date.now());
  if (terms.length === 0 || terms.length !== ids.length) {
    throw new UserError("Któryś z wybranych terminów nie zbiera już zgłoszeń. Odśwież stronę i wybierz ponownie.", 409);
  }
  const db = getDb();
  const email = normalizeEmail(req.email);
  const tok = token();
  const now = nowIso();
  tx(db, () => {
    const insert = db.prepare(`
      INSERT INTO interest (token, term_id, name, email, phone, people, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (term_id, email) DO NOTHING`);
    const added = terms.filter((t) => Number(insert.run(tok, t.id, req.name, email, req.phone ?? null, req.people, req.notes ?? null, now).changes) === 1);
    if (added.length === 0) return;
    enqueue(
      ...(underHourlyCap("interest-thanks") ? [interestThanks(email, req.name, added, tok)] : []),
      interestNotify(req.name, email, req.people, added),
    );
  });
  return { terms: terms.length };
}

export function interestByToken(tok: string): { term: Term | undefined; withdrawn: boolean }[] {
  const rows = getDb().prepare("SELECT term_id, withdrawn_at FROM interest WHERE token = ?").all(tok) as unknown as { term_id: string; withdrawn_at: string | null }[];
  return rows.map((r) => ({ term: getTerm(r.term_id), withdrawn: !!r.withdrawn_at }));
}

/**
 * The row stays (without phone and notes) until the term's own cleanup, so the same address
 * can't be signed up for that date again by someone else.
 */
export function withdrawInterest(tok: string): number {
  const db = getDb();
  return tx(db, () => {
    const r = db.prepare("UPDATE interest SET withdrawn_at = ?, phone = NULL, notes = NULL WHERE token = ? AND withdrawn_at IS NULL").run(nowIso(), tok);
    // a "your date is open" mail for this sign-up that hasn't gone out is no longer wanted; the mail
    // carries this token in its withdraw link, so other sign-ups from the same address keep theirs
    db.prepare("DELETE FROM outbox WHERE status IN ('pending','failed') AND kind = 'term-opened' AND instr(text, ?) > 0").run(`?t=${tok}`);
    return Number(r.changes);
  });
}

export interface InterestRow {
  id: number; name: string; email: string; phone: string | null; people: number; notes: string | null;
  created_at: string; notified_at: string | null; withdrawn_at: string | null;
}

export function interestForTerm(termId: string): InterestRow[] {
  return getDb().prepare("SELECT * FROM interest WHERE term_id = ? ORDER BY created_at").all(termId) as unknown as InterestRow[];
}

/* ---------- Dominika's corrections in the panel (a request by phone or e-mail) ---------- */

export interface InterestEdit { name: string; phone: string | null; people: number; notes: string | null }

const peopleRule = `Liczba osób musi być od 1 do ${site.bookingMax}.`;
// the public form's rules; the e-mail isn't editable: it is the person's identity and unique per term
const editSchema = z.object({
  name: fields.name,
  phone: fields.phone.optional().or(z.literal("")),
  people: z.number(peopleRule).int(peopleRule).min(1, peopleRule).max(site.bookingMax, peopleRule),
  notes: fields.notes,
});

/** Reads the "Popraw" form on the term page. */
export function interestEditFromForm(f: FormData): InterestEdit {
  const get = (k: string) => String(f.get(k) ?? "").trim();
  const r = editSchema.safeParse(
    { name: get("name"), phone: get("phone"), people: Number(get("people")), notes: get("notes") },
    { error: () => "Sprawdź pola formularza i spróbuj ponownie." },
  );
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Sprawdź pola formularza i spróbuj ponownie.");
  return { name: r.data.name, phone: r.data.phone || null, people: r.data.people, notes: r.data.notes || null };
}

/** The row, only if it belongs to the term whose page sent the form. */
function rowOnTerm(termId: string, id: number): InterestRow {
  const r = Number.isInteger(id)
    ? getDb().prepare("SELECT * FROM interest WHERE id = ? AND term_id = ?").get(id, termId) as unknown as InterestRow | undefined
    : undefined;
  if (!r) throw new UserError("Nie ma takiego zgłoszenia na ten termin.", 404);
  return r;
}

/**
 * Drops this address's unsent "your date is open" mail for this term only. One token covers every
 * date ticked together, so the token can't tell them apart; the mail names its term in the booking
 * link instead. Ids can extend one another (t-…-1100, t-…-1100-2), hence the boundary after the id.
 */
function dropTermOpened(email: string, termId: string): void {
  const db = getDb();
  const escaped = termId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = new RegExp(`[?&]termin=${escaped}(?![\\w-])`);
  const queued = db.prepare("SELECT id, text FROM outbox WHERE status IN ('pending','failed') AND kind = 'term-opened' AND to_addr = ?")
    .all(email) as unknown as { id: number; text: string }[];
  const del = db.prepare("DELETE FROM outbox WHERE id = ?");
  for (const m of queued) if (link.test(m.text)) del.run(m.id);
}

export function editInterest(termId: string, id: number, e: InterestEdit): void {
  const db = getDb();
  tx(db, () => {
    // a withdrawn row was emptied on purpose; it stays that way
    if (rowOnTerm(termId, id).withdrawn_at) throw new UserError("To zgłoszenie jest wycofane, więc nie można go poprawić.");
    db.prepare("UPDATE interest SET name = ?, phone = ?, people = ?, notes = ? WHERE id = ?").run(e.name, e.phone, e.people, e.notes, id);
  });
}

/** Like the person's own withdrawal (withdrawInterest), but for this one date. */
export function withdrawInterestRow(termId: string, id: number): void {
  const db = getDb();
  tx(db, () => {
    const r = rowOnTerm(termId, id);
    if (r.withdrawn_at) throw new UserError("To zgłoszenie jest już wycofane.");
    db.prepare("UPDATE interest SET withdrawn_at = ?, phone = NULL, notes = NULL WHERE id = ?").run(nowIso(), id);
    dropTermOpened(r.email, termId);
  });
}

/** Erasure request or a stranger's address: nothing is kept, so the address can sign up for this date again. */
export function deleteInterestRow(termId: string, id: number): void {
  const db = getDb();
  tx(db, () => {
    const r = rowOnTerm(termId, id);
    db.prepare("DELETE FROM interest WHERE id = ?").run(id);
    dropTermOpened(r.email, termId);
  });
}

/** Sends the "your date is open, book here" e-mail to everyone who ticked this term and hasn't had it yet. */
export function notifyInterested(termId: string): number {
  const t = getTerm(termId);
  if (!t || t.status !== "open") throw new UserError("Najpierw otwórz zapisy na ten termin.");
  if (bookingClosed(t)) throw new UserError("Do tego terminu zostało mniej niż 48 godzin, więc zapisy online są już zamknięte. Napisz albo zadzwoń do chętnych sama.");
  const db = getDb();
  return tx(db, () => {
    const rows = db.prepare("SELECT id, token, name, email FROM interest WHERE term_id = ? AND withdrawn_at IS NULL AND notified_at IS NULL")
      .all(termId) as unknown as { id: number; token: string; name: string; email: string }[];
    const mark = db.prepare("UPDATE interest SET notified_at = ? WHERE id = ?");
    const now = nowIso();
    for (const r of rows) {
      enqueue(termOpened(r.email, r.name, t, r.token));
      mark.run(now, r.id);
    }
    return rows.length;
  });
}
