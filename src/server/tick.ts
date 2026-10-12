/**
 * Background work: send queued e-mail, day-before reminders and the retention clean-up promised
 * in the privacy policy. Runs every minute inside the server process, and /api/cron triggers it
 * too (a systemd timer calls it, so it also runs after a restart with no visitors).
 */
import { notifyOverdue, sendReminders } from "./bookings";
import { getDb } from "./db";
import { flushOutbox } from "./mail";

const DAY = 24 * 60 * 60 * 1000;
let lastCleanup = 0;

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
    // allergy notes: 30 days after the workshop
    db.prepare("UPDATE bookings SET notes = NULL WHERE term_id = ? AND notes IS NOT NULL").run(id);
  }
  // withdrawn interest and unsubscribed addresses: gone within a day (the confirmation pages still work meanwhile)
  db.prepare("DELETE FROM interest WHERE withdrawn_at IS NOT NULL AND withdrawn_at < ?").run(ago(1));
  db.prepare("DELETE FROM subscribers WHERE status = 'unsubscribed' AND unsubscribed_at < ?").run(ago(1));
  db.prepare("DELETE FROM subscribers WHERE status = 'pending' AND created_at < ?").run(ago(30));
  db.prepare("DELETE FROM inquiries WHERE created_at < ?").run(ago(365));
  // sent mail holds names and addresses; keep it only long enough to answer "did you get my e-mail?"
  // (30 days also keeps allergy notes in booking notices within the 30-days-after-the-workshop promise)
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
