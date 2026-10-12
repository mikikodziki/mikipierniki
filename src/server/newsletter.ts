/**
 * "Powiadom mnie" list with double opt-in: nothing is sent to an address until its owner
 * clicks the confirmation link. Every broadcast carries a one-click unsubscribe link.
 */
import { getDb, nowIso } from "./db";
import { newsletterBroadcast, newsletterConfirm } from "./emails";
import { enqueue } from "./mail";
import { normalizeEmail, token } from "./util";

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
  const tok = token();
  if (row) {
    // a repeat within 10 minutes doesn't send another confirmation
    if (row.status === "pending" && Date.now() - new Date(row.created_at).getTime() < 10 * 60 * 1000) return;
    db.prepare("UPDATE subscribers SET token = ?, status = 'pending', created_at = ?, unsubscribed_at = NULL WHERE email = ?").run(tok, nowIso(), email);
  } else {
    db.prepare("INSERT INTO subscribers (email, token, status, created_at) VALUES (?, ?, 'pending', ?)").run(email, tok, nowIso());
  }
  enqueue(newsletterConfirm(email, tok));
}

export function confirmSubscription(tok: string): "ok" | "unknown" {
  const db = getDb();
  const row = db.prepare("SELECT status FROM subscribers WHERE token = ?").get(tok) as { status: string } | undefined;
  if (!row || row.status === "unsubscribed") return "unknown";
  if (row.status === "pending") db.prepare("UPDATE subscribers SET status = 'active', confirmed_at = ? WHERE token = ?").run(nowIso(), tok);
  return "ok";
}

export function unsubscribe(tok: string): boolean {
  const r = getDb().prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE token = ? AND status != 'unsubscribed'").run(nowIso(), tok);
  return Number(r.changes) > 0;
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
