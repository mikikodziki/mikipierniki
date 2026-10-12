/**
 * Outgoing e-mail. Everything is queued in the `outbox` table first and sent by `flushOutbox()`,
 * which retries with a growing delay. Without SMTP settings (local development) messages are
 * written to data/mail/ and logged instead of sent.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";
import { getDb, nowIso } from "./db";

export interface Mail {
  kind: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

const MAX_ATTEMPTS = 8;

export function enqueue(...mails: Mail[]): void {
  const stmt = getDb().prepare(`INSERT INTO outbox (kind, to_addr, reply_to, subject, text, html, headers, send_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = nowIso();
  for (const m of mails) {
    stmt.run(m.kind, m.to, m.replyTo ?? null, m.subject, m.text, m.html, m.headers ? JSON.stringify(m.headers) : null, now, now);
  }
}

let transport: Transporter | undefined;
function getTransport(): Transporter | undefined {
  if (!config.smtp) return undefined;
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
}

interface OutboxRow {
  id: number; kind: string; to_addr: string; reply_to: string | null; subject: string; text: string; html: string;
  headers: string | null; attempts: number;
}

let flushing = false;

/** Sends what is due. Safe to call often; overlapping calls return immediately. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const db = getDb();
    const due = db.prepare(`SELECT * FROM outbox WHERE status = 'pending' AND send_after <= ? ORDER BY id LIMIT 50`)
      .all(nowIso()) as unknown as OutboxRow[];
    const t = getTransport();
    for (const m of due) {
      try {
        if (t) {
          await t.sendMail({
            from: config.mailFrom, to: m.to_addr, replyTo: m.reply_to ?? undefined,
            subject: m.subject, text: m.text, html: m.html,
            headers: m.headers ? JSON.parse(m.headers) : undefined,
          });
        } else {
          writeDevMail(m);
        }
        db.prepare("UPDATE outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?").run(nowIso(), m.id);
      } catch (e) {
        const attempts = m.attempts + 1;
        // 1, 4, 9, 16... minutes between tries
        const next = new Date(Date.now() + attempts * attempts * 60_000).toISOString();
        db.prepare("UPDATE outbox SET attempts = ?, last_error = ?, send_after = ?, status = ? WHERE id = ?")
          .run(attempts, String(e).slice(0, 500), next, attempts >= MAX_ATTEMPTS ? "failed" : "pending", m.id);
        console.error(`[mail] ${m.kind} to ${m.to_addr} failed (attempt ${attempts}):`, e);
      }
    }
  } finally {
    flushing = false;
  }
}

function writeDevMail(m: OutboxRow) {
  const dir = join(dirname(config.databasePath), "mail");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${String(m.id).padStart(5, "0")}-${m.kind}.txt`);
  writeFileSync(file, `To: ${m.to_addr}\nReply-To: ${m.reply_to ?? ""}\nSubject: ${m.subject}\nHeaders: ${m.headers ?? ""}\n\n${m.text}\n`);
  writeFileSync(file.replace(/\.txt$/, ".html"), m.html);
  console.log(`[mail] (dev) ${m.kind} → ${m.to_addr}: ${m.subject}  [${file}]`);
}

export function outboxStats(): { pending: number; failed: number } {
  return getDb().prepare(`SELECT SUM(status = 'pending') AS pending, SUM(status = 'failed') AS failed FROM outbox`)
    .get() as unknown as { pending: number; failed: number };
}

/** Puts failed messages back in the queue (panel button after fixing the mail settings). */
export function retryFailed(): number {
  const r = getDb().prepare(`UPDATE outbox SET status = 'pending', attempts = 0, send_after = ? WHERE status = 'failed'`).run(nowIso());
  return Number(r.changes);
}
