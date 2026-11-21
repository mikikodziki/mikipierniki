/**
 * "Powiadom mnie" list with double opt-in: nothing is sent to an address until its owner
 * clicks the confirmation link. Every broadcast carries a one-click unsubscribe link.
 */
import { createHash } from "node:crypto";
import { getDb, nowIso, tx } from "./db";
import { newsletterBroadcast, newsletterConfirm } from "./emails";
import { enqueue } from "./mail";
import { normalizeEmail, token } from "./util";

/** Version of the consent wording shown next to the sign-up form; bump it when that text changes. */
export const NEWSLETTER_CONSENT_VERSION = "2026-11-21";

/** One confirmation e-mail per address in this time, however often the form is sent. */
const CONFIRM_MAIL_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Outbox kinds that carry newsletter mail to a subscriber. */
const NEWSLETTER_KINDS = ["newsletter", "newsletter-confirm"];

const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

interface SubscriberRow {
  email: string; token: string; status: "pending" | "active" | "unsubscribed";
  created_at: string; confirmed_at: string | null; unsubscribed_at: string | null;
}

/** Always answers the same way, so the form can't be used to find out who is on the list. */
export function subscribe(rawEmail: string): void {
  const db = getDb();
  const email = normalizeEmail(rawEmail);
  const row = db.prepare("SELECT * FROM subscribers WHERE email = ?").get(email) as unknown as SubscriberRow | undefined;
  if (row?.status === "active") return;
  // a repeat within 24 hours doesn't send another confirmation
  const recent = db.prepare("SELECT 1 FROM outbox WHERE kind = 'newsletter-confirm' AND to_addr = ? AND created_at > ?")
    .get(email, new Date(Date.now() - CONFIRM_MAIL_INTERVAL_MS).toISOString());
  if (recent) return;
  const tok = token();
  if (row) {
    db.prepare("UPDATE subscribers SET token = ?, status = 'pending', created_at = ?, unsubscribed_at = NULL WHERE email = ?").run(tok, nowIso(), email);
  } else {
    db.prepare("INSERT INTO subscribers (email, token, status, created_at) VALUES (?, ?, 'pending', ?)").run(email, tok, nowIso());
  }
  enqueue(newsletterConfirm(email, tok));
}

/** Confirms the address and records the consent in `consent_log` (each sign-up gets its own row). */
export function confirmSubscription(tok: string): "ok" | "unknown" {
  const db = getDb();
  return tx(db, () => {
    const row = db.prepare("SELECT * FROM subscribers WHERE token = ?").get(tok) as unknown as SubscriberRow | undefined;
    if (!row || row.status === "unsubscribed") return "unknown";
    if (row.status === "pending") {
      const now = nowIso();
      db.prepare("UPDATE subscribers SET status = 'active', confirmed_at = ? WHERE token = ?").run(now, tok);
      db.prepare("INSERT INTO consent_log (email_hash, consent_version, subscribed_at, confirmed_at) VALUES (?, ?, ?, ?)")
        .run(emailHash(row.email), NEWSLETTER_CONSENT_VERSION, row.created_at, now);
    }
    return "ok";
  });
}

/** Unsubscribes, closes the open consent record and drops newsletter mail that hasn't gone out yet. */
export function unsubscribe(tok: string): boolean {
  const db = getDb();
  return tx(db, () => {
    const row = db.prepare("SELECT email FROM subscribers WHERE token = ? AND status != 'unsubscribed'").get(tok) as { email: string } | undefined;
    if (!row) return false;
    const now = nowIso();
    db.prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE token = ?").run(now, tok);
    db.prepare(`UPDATE consent_log SET unsubscribed_at = ? WHERE id = (
      SELECT id FROM consent_log WHERE email_hash = ? AND unsubscribed_at IS NULL ORDER BY id DESC LIMIT 1)`).run(now, emailHash(row.email));
    db.prepare(`DELETE FROM outbox WHERE status = 'pending' AND to_addr = ? AND kind IN (${NEWSLETTER_KINDS.map(() => "?").join(",")})`)
      .run(row.email, ...NEWSLETTER_KINDS);
    return true;
  });
}

export function subscriberByToken(tok: string): SubscriberRow | undefined {
  return getDb().prepare("SELECT * FROM subscribers WHERE token = ?").get(tok) as unknown as SubscriberRow | undefined;
}

export function subscribers(): SubscriberRow[] {
  return getDb().prepare("SELECT * FROM subscribers ORDER BY created_at DESC").all() as unknown as SubscriberRow[];
}

export function broadcast(subject: string, body: string): number {
  const active = getDb().prepare("SELECT email, token FROM subscribers WHERE status = 'active'").all() as unknown as { email: string; token: string }[];
  enqueue(...active.map((s) => newsletterBroadcast(s.email, subject, body, s.token)));
  return active.length;
}
