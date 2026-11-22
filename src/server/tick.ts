/**
 * Background work: send queued e-mail, day-before reminders, the retention clean-up promised
 * in the privacy policy and the alert when the nightly database copy fails. Runs every minute inside the server process, and /api/cron triggers it
 * too (cron calls it via deploy/cron.sh, so it also runs after a restart with no visitors).
 */
import { checkBackupAlert } from "./backup-alert";
import { notifyOverdue, sendReminders } from "./bookings";
import { getDb, tx } from "./db";
import { flushOutbox } from "./mail";
import { collectHits } from "./stats";
import { freezeTermStats } from "./term-stats";

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
  tx(db, () => deleteExpired(db, now));
  // secure_delete zeroes freed pages in the database file; this also empties the write-ahead log,
  // which still holds copies of the pages as they were before the deletes
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

function deleteExpired(db: ReturnType<typeof getDb>, now: number): void {
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  // compare end times as instants in JS, since they carry a local offset
  const terms = db.prepare("SELECT id, ends_at FROM terms").all() as unknown as { id: string; ends_at: string }[];
  const endedBefore = (ms: number) => terms.filter((t) => new Date(t.ends_at).getTime() < ms).map((t) => t.id);
  const dropInterest = db.prepare("DELETE FROM interest WHERE term_id = ?");
  // bookings that were never paid (awaiting payment, waitlist, cancelled before payment)
  const dropUnpaid = db.prepare("DELETE FROM bookings WHERE term_id = ? AND paid_at IS NULL");
  const dropNotes = db.prepare("UPDATE bookings SET notes = NULL WHERE term_id = ? AND notes IS NOT NULL");
  // the statistics keep each term's totals (sums only) after its sign-ups are gone
  freezeTermStats(db, endedBefore(now - 30 * DAY));
  for (const id of endedBefore(now - 30 * DAY)) {
    dropInterest.run(id);
    dropUnpaid.run(id);
    // booking notes: 30 days after the workshop
    dropNotes.run(id);
  }
  // paid bookings are kept for 6 years after the workshop (accounting records)
  const dropPaid = db.prepare("DELETE FROM bookings WHERE term_id = ? AND paid_at IS NOT NULL");
  for (const id of endedBefore(new Date(yearsAgo(now, 6)).getTime())) dropPaid.run(id);
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
  try {
    collectHits();
  } catch (e) {
    console.error("[stats]", e);
  }
  sendReminders();
  notifyOverdue();
  try {
    checkBackupAlert();
  } catch (e) {
    console.error("[backup-alert]", e);
  }
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
