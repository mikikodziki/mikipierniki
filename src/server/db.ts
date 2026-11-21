/**
 * SQLite through Node's built-in driver: one file, one process, no service to run.
 * Migrations are appended to the list below and applied in order on start.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";
import { emailHash } from "./util";

/** SQL, or a function for a step SQLite can't do alone; each runs once, in order, in its own transaction. */
const migrations: (string | ((conn: DatabaseSync) => void))[] = [
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
  `
  -- proof of the newsletter consent: keyed by a hash of the address, so it can outlive the subscriber row
  CREATE TABLE consent_log (
    id INTEGER PRIMARY KEY,
    email_hash TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    subscribed_at TEXT,
    confirmed_at TEXT,
    unsubscribed_at TEXT
  );
  CREATE INDEX consent_log_email ON consent_log (email_hash);
  `,
  // subscribers who confirmed before consent_log existed get their row too (sha256 needs JS)
  (conn) => {
    const rows = conn.prepare("SELECT email, created_at, confirmed_at FROM subscribers WHERE status = 'active'").all() as unknown as
      { email: string; created_at: string; confirmed_at: string | null }[];
    const add = conn.prepare("INSERT INTO consent_log (email_hash, consent_version, subscribed_at, confirmed_at) VALUES (?, 'przed-2026-11-21', ?, ?)");
    for (const r of rows) add.run(emailHash(r.email), r.created_at, r.confirmed_at);
  },
  `
  -- visit statistics (src/server/stats.ts): daily sums only, no IP addresses, no visitor identifiers
  CREATE TABLE stats_views (
    day TEXT NOT NULL,
    path TEXT NOT NULL,
    -- '' for a step between our own pages, otherwise where the visit came from
    source TEXT NOT NULL,
    utm_source TEXT NOT NULL,
    utm_medium TEXT NOT NULL,
    utm_campaign TEXT NOT NULL,
    device TEXT NOT NULL CHECK (device IN ('telefon','komputer')),
    views INTEGER NOT NULL DEFAULT 0,
    entries INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, path, source, utm_source, utm_medium, utm_campaign, device)
  ) WITHOUT ROWID;
  CREATE TABLE stats_hours (
    day TEXT NOT NULL,
    hour INTEGER NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    entries INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, hour)
  ) WITHOUT ROWID;
  CREATE TABLE stats_forms (
    day TEXT NOT NULL,
    form TEXT NOT NULL,
    page TEXT NOT NULL,
    utm_source TEXT NOT NULL,
    outcome TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, form, page, utm_source, outcome)
  ) WITHOUT ROWID;
  CREATE TABLE stats_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- per-term totals (src/server/term-stats.ts); frozen before the clean-up deletes the sign-ups behind them
  CREATE TABLE term_stats (
    term_id TEXT PRIMARY KEY,
    interest_entries INTEGER NOT NULL,
    interest_people INTEGER NOT NULL,
    booked_people INTEGER NOT NULL,
    paid_people INTEGER NOT NULL,
    revenue INTEGER NOT NULL,
    waitlist_people INTEGER NOT NULL,
    cancelled_people INTEGER NOT NULL,
    frozen INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  `,
];

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const conn = new DatabaseSync(config.databasePath);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;");
  const { user_version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < migrations.length; v++) {
    tx(conn, () => {
      const m = migrations[v];
      if (typeof m === "string") conn.exec(m);
      else m(conn);
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
