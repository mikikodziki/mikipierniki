/**
 * Interest in proposed dates: visitors tick the dates that suit them, Dominika sees the tally
 * in the panel, opens the winners and mails everyone who ticked them.
 */
import type { InterestRequest, Term } from "@/lib/types";
import { getDb, nowIso, tx } from "./db";
import { interestNotify, interestThanks, termOpened } from "./emails";
import { UserError } from "./http";
import { enqueue } from "./mail";
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
      interestThanks(email, req.name, added, tok),
      interestNotify(req.name, email, req.phone, req.people, req.notes, added),
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
  const r = getDb().prepare("UPDATE interest SET withdrawn_at = ?, phone = NULL, notes = NULL WHERE token = ? AND withdrawn_at IS NULL").run(nowIso(), tok);
  return Number(r.changes);
}

export interface InterestRow {
  id: number; name: string; email: string; phone: string | null; people: number; notes: string | null;
  created_at: string; notified_at: string | null; withdrawn_at: string | null;
}

export function interestForTerm(termId: string): InterestRow[] {
  return getDb().prepare("SELECT * FROM interest WHERE term_id = ? ORDER BY created_at").all(termId) as unknown as InterestRow[];
}

/** Sends the "your date is open, book here" e-mail to everyone who ticked this term and hasn't had it yet. */
export function notifyInterested(termId: string): number {
  const t = getTerm(termId);
  if (!t || t.status !== "open") throw new UserError("Najpierw otwórz zapisy na ten termin.");
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
