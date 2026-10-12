/**
 * SQLite through Node's built-in driver: one file, one process, no service to run.
 * Migrations are appended to the list below and applied in order on start.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";

const migrations: string[] = [
  `
  CREATE TABLE terms (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('draft','proposed','open','cancelled')),
    type TEXT NOT NULL CHECK (type IN ('dorosli','dzieci','wieczor')),
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    venue_id TEXT NOT NULL DEFAULT 'pracownia',
    price INTEGER NOT NULL,
    price_unit TEXT NOT NULL CHECK (price_unit IN ('osoba','dziecko')),
    capacity INTEGER NOT NULL,
    cookies TEXT NOT NULL DEFAULT '6–8',
    photo TEXT NOT NULL,
    photo_alt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX terms_starts ON terms (starts_at);

  -- one row per (submission, term); a submission shares its token across the terms ticked together
  CREATE TABLE interest (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL,
    term_id TEXT NOT NULL REFERENCES terms (id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    people INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    notified_at TEXT,
    withdrawn_at TEXT,
    UNIQUE (term_id, email)
  );
  CREATE INDEX interest_token ON interest (token);

  CREATE TABLE bookings (
    id TEXT PRIMARY KEY,
    term_id TEXT NOT NULL REFERENCES terms (id),
    status TEXT NOT NULL CHECK (status IN ('awaiting_payment','confirmed','waitlist','cancelled')),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    people INTEGER NOT NULL,
    guardians INTEGER,
    notes TEXT,
    payment TEXT NOT NULL CHECK (payment IN ('przelew','voucher')),
    voucher_code TEXT,
    total INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    -- transfers are due 3 days after the booking, or after a waitlist place is offered
    payment_due_at TEXT,
    paid_at TEXT,
    cancelled_at TEXT,
    reminded_at TEXT
  );
  CREATE INDEX bookings_term ON bookings (term_id, status);

  CREATE TABLE subscribers (
    email TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending','active','unsubscribed')),
    created_at TEXT NOT NULL,
    confirmed_at TEXT,
    unsubscribed_at TEXT
  );

  CREATE TABLE inquiries (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );

  -- every e-mail goes through here, so a mail server hiccup only delays it
  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    to_addr TEXT NOT NULL,
    reply_to TEXT,
    subject TEXT NOT NULL,
    text TEXT NOT NULL,
    html TEXT NOT NULL,
    headers TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    send_after TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sent_at TEXT
  );
  CREATE INDEX outbox_pending ON outbox (status, send_after);
  `,
  `
  -- Dominika gets one e-mail when an unpaid transfer booking passes its deadline
  ALTER TABLE bookings ADD COLUMN overdue_notified_at TEXT;
  `,
];

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const conn = new DatabaseSync(config.databasePath);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < migrations.length; v++) {
    tx(conn, () => {
      conn.exec(migrations[v]);
      conn.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  db = conn;
  return conn;
}

/** BEGIN IMMEDIATE takes the write lock up front, so two bookings can't both see the last seat. */
export function tx<T>(conn: DatabaseSync, fn: () => T): T {
  conn.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export const nowIso = () => new Date().toISOString();
