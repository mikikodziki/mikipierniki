/**
 * Background work: send queued e-mail, day-before reminders and the retention clean-up promised
 * in the privacy policy. Runs every minute inside the server process, and /api/cron triggers it
 * too (cron calls it via deploy/cron.sh, so it also runs after a restart with no visitors).
 */
import { notifyOverdue, sendReminders } from "./bookings";
import { getDb } from "./db";
import { flushOutbox } from "./mail";

const DAY = 24 * 60 * 60 * 1000;
let lastCleanup = 0;

/** The same calendar day `years` years before `now`, as an ISO string. */
function yearsAgo(now: number, years: number): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString();
}

/** Deletes what the privacy policy says we no longer keep. */
export function cleanup(now = Date.now()): void {
  const db = getDb();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  // ended terms: compare as instants in JS, since starts_at carries a local offset
  const ended = (db.prepare("SELECT id, ends_at FROM terms").all() as unknown as { id: string; ends_at: string }[])
    .filter((t) => new Date(t.ends_at).getTime() < now - 30 * DAY)
    .map((t) => t.id);
  for (const id of ended) {
    db.prepare("DELETE FROM interest WHERE term_id = ?").run(id);
    // bookings that were never paid (awaiting payment, waitlist, cancelled before payment)
    db.prepare("DELETE FROM bookings WHERE term_id = ? AND paid_at IS NULL").run(id);
    // booking notes: 30 days after the workshop
    db.prepare("UPDATE bookings SET notes = NULL WHERE term_id = ? AND notes IS NOT NULL").run(id);
  }
  // paid bookings are kept for 6 years after the workshop (accounting records)
  const sixYearsAgo = new Date(yearsAgo(now, 6)).getTime();
  const old = (db.prepare("SELECT id, ends_at FROM terms").all() as unknown as { id: string; ends_at: string }[])
    .filter((t) => new Date(t.ends_at).getTime() < sixYearsAgo);
  for (const t of old) db.prepare("DELETE FROM bookings WHERE term_id = ? AND paid_at IS NOT NULL").run(t.id);
  // proof of newsletter consent: 3 years after the consent ended
  db.prepare("DELETE FROM consent_log WHERE unsubscribed_at IS NOT NULL AND unsubscribed_at < ?").run(yearsAgo(now, 3));
  // withdrawn interest stays with its term (see withdrawInterest); unsubscribed addresses go within a day
  db.prepare("DELETE FROM subscribers WHERE status = 'unsubscribed' AND unsubscribed_at < ?").run(ago(1));
  db.prepare("DELETE FROM subscribers WHERE status = 'pending' AND created_at < ?").run(ago(30));
  db.prepare("DELETE FROM inquiries WHERE created_at < ?").run(ago(365));
  // sent mail holds names and addresses; keep it only long enough to answer "did you get my e-mail?"
  // (customer e-mails can carry booking details, so they follow the same 30 days)
  db.prepare("DELETE FROM outbox WHERE status = 'sent' AND sent_at < ?").run(ago(30));
  db.prepare("DELETE FROM outbox WHERE status = 'failed' AND created_at < ?").run(ago(30));
}

export async function tick(): Promise<void> {
  sendReminders();
  notifyOverdue();
  if (Date.now() - lastCleanup > 60 * 60 * 1000) {
    cleanup();
    lastCleanup = Date.now();
  }
  await flushOutbox();
}

let started = false;
export function ensureWorker(): void {
  if (started) return;
  started = true;
  setInterval(() => tick().catch((e) => console.error("[tick]", e)), 60_000).unref();
  tick().catch((e) => console.error("[tick]", e));
}
