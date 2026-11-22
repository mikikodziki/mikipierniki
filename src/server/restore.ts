/**
 * Restoring a database copy from the panel (Kopie). Two steps, so only the administrator can do it:
 * 1. "Przywróć…" (anyone with the panel password) only e-mails a one-time link to MAIL_ADMIN.
 * 2. The link opens a summary behind the panel password; the restore runs on a POST from that page,
 *    with the copy's date typed in. Opening the link changes nothing (mail scanners open links).
 *
 * On seohost several app processes share the database, so the file is never swapped or reopened:
 * the copy is prepared in a temp file (checked, brought to the current schema), attached, and its
 * tables replace ours in one write transaction, which every process sees at once. Before that the
 * current state is saved next to the nightly copies, so the restore itself can be undone.
 *
 * Only the sign-up data goes back to the copy (RESTORED). What already happened in the world stays
 * as it is now (KEPT): sent mail, newsletter consents and unsubscribes, inquiries, statistics. Markers
 * that a reminder went out or a person withdrew are carried over, so nobody gets the same mail twice
 * and nobody who withdrew comes back (a cancelled term keeps its withdrawn rows for this, see cancelTerm).
 */
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { shortDate } from "@/lib/format";
import type { TermStatus } from "@/lib/types";
import { backupDir, type BackupCopy, confirmPhrase, copyLabel, findCopy, madeNoLaterThan, RESTORE_TEMP } from "./backups";
import { config } from "./config";
import { getDb, migrate, nowIso, SCHEMA_VERSION, tx } from "./db";
import { restoreDone, restoreLink } from "./emails";
import { UserError } from "./http";
import { enqueue, underHourlyCap } from "./mail";
import { cleanup } from "./tick";

/** Every table is in exactly one list; a table in neither stops the restore, so a new one can't default silently. */
const RESTORED = ["terms", "bookings", "interest", "term_stats"];
const KEPT = ["outbox", "subscribers", "consent_log", "inquiries", "stats_views", "stats_hours", "stats_forms", "stats_meta", "app_state", "restore_links"];
/**
 * Columns that record a mail sent or a withdrawal: taken from now when the copy has none. Each holds
 * only while the columns it is about are the same: a booking moved to another date or address gets
 * its reminder again, a new payment deadline its own overdue notice (bookings.ts clears them then).
 */
const CARRIED: Record<string, { key: string[]; cols: Record<string, string[]> }> = {
  bookings: { key: ["id"], cols: { reminded_at: ["term_id", "email"], overdue_notified_at: ["payment_due_at"] } },
  interest: { key: ["term_id", "email"], cols: { notified_at: [], withdrawn_at: [] } },
};
/**
 * A row deleted since the copy comes back without those markers, but its mail is still in the outbox
 * (kept, and sent mail stays there 30 days, as long as the copies). Only for such rows (a row in the
 * database now says itself what was sent) and only mail queued after the copy was made ($since; older
 * mail is already in the copy's own markers, and a marker cleared there was cleared on purpose).
 * Matched on what the templates in emails.ts put in each mail: the booking number, or the term's
 * booking link in the button (its closing quote ends the id, so term "x" doesn't match "x-2").
 */
const SENT_FROM_OUTBOX = [
  `UPDATE main.bookings SET reminded_at = (SELECT MIN(o.created_at) FROM main.outbox o WHERE o.kind = 'booking-reminder' AND o.status IN ('pending', 'sent')
    AND o.created_at >= $since AND o.to_addr = bookings.email AND instr(o.text, bookings.id) > 0)
    WHERE reminded_at IS NULL AND id NOT IN (SELECT id FROM temp.carry_bookings)`,
  `UPDATE main.bookings SET overdue_notified_at = (SELECT MIN(o.created_at) FROM main.outbox o WHERE o.kind = 'booking-overdue' AND o.status IN ('pending', 'sent')
    AND o.created_at >= $since AND instr(o.subject, bookings.id) > 0)
    WHERE overdue_notified_at IS NULL AND id NOT IN (SELECT id FROM temp.carry_bookings)`,
  `UPDATE main.interest SET notified_at = (SELECT MIN(o.created_at) FROM main.outbox o WHERE o.kind = 'term-opened' AND o.status IN ('pending', 'sent')
    AND o.created_at >= $since AND o.to_addr = interest.email AND instr(o.html, '?termin=' || interest.term_id || '"') > 0)
    WHERE notified_at IS NULL AND NOT EXISTS (SELECT 1 FROM temp.carry_interest c WHERE c.term_id = interest.term_id AND c.email = interest.email)`,
];
const LINK_MINUTES = 30;
const LINKS_PER_HOUR = 5;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
type Copy = BackupCopy & { path: string };

/* ---------- step 1: the link ---------- */

export const restoreEnabled = () => !!config.mailAdmin;

export function requestRestore(copyName: string): void {
  if (!config.mailAdmin) throw new UserError("Przywracanie z panelu jest wyłączone: na serwerze nie ma adresu administratora (MAIL_ADMIN).");
  const copy = findCopy(copyName);
  if (!copy) throw new UserError("Nie ma takiej kopii (mogła zniknąć po 30 dniach).");
  if (!underHourlyCap("restore-link", LINKS_PER_HOUR)) throw new UserError("Za dużo próśb o przywrócenie w ciągu godziny. Spróbuj później.");
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const db = getDb();
  tx(db, () => {
    db.prepare("INSERT INTO restore_links (token_hash, copy, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(hash(token), copy.name, new Date(now).toISOString(), new Date(now + LINK_MINUTES * 60_000).toISOString());
    enqueue(restoreLink(config.mailAdmin!, copyLabel(copy), `${config.siteUrl}/panel/kopie/przywroc?t=${token}`, LINK_MINUTES));
  });
}

/** What a link points to, or why it can't be used. Reading never uses the link up. */
export function linkTarget(token: string): { copy: Copy; expiresAt: string } | { error: string } {
  const row = token
    ? getDb().prepare("SELECT copy, expires_at, used_at FROM restore_links WHERE token_hash = ?").get(hash(token)) as
      { copy: string; expires_at: string; used_at: string | null } | undefined
    : undefined;
  if (!row) return { error: "Ten link jest nieprawidłowy. Poproś o nowy w panelu (Kopie)." };
  if (row.used_at) return { error: "Ten link został już wykorzystany. Poproś o nowy w panelu (Kopie)." };
  if (row.expires_at <= nowIso()) return { error: "Ten link wygasł. Poproś o nowy w panelu (Kopie)." };
  const copy = findCopy(row.copy);
  if (!copy) return { error: "Tej kopii nie ma już na serwerze." };
  return { copy, expiresAt: row.expires_at };
}

/* ---------- step 2: summary and restore ---------- */

export interface Change {
  what: "termin" | "rezerwacja" | "chętny";
  label: string;
}
export interface Preview {
  /** in the database now, not in the copy: these disappear */
  lost: Change[];
  /** in the copy, deleted since: these come back */
  back: Change[];
  /** terms in both but different, e.g. cancelled since the copy: listed by name */
  changedTerms: Change[];
  /** a term cancelled since the copy comes back: people may have had the cancellation e-mail */
  uncancelled: boolean;
  /** bookings in both but different, e.g. cancelled, paid or moved since the copy: listed, since they matter most */
  changedBookings: Change[];
  /** date picks in both but different (counted) */
  changed: number;
}

const BOOKING_STATUS: Record<string, string> = { awaiting_payment: "czeka na wpłatę", confirmed: "potwierdzona", waitlist: "lista rezerwowa", cancelled: "anulowana" };
const TERM_STATUS: Record<TermStatus, string> = { draft: "szkic", proposed: "propozycja", open: "zapisy otwarte", cancelled: "odwołany" };

/** Compares the copy with the database now, without changing anything. */
export function previewRestore(copy: Copy): Preview {
  return withCopy(copy, (db) => {
    const list = (sql: string, what: Change["what"], from: "main" | "src", other: "main" | "src") =>
      (db.prepare(sql.replaceAll("$from", from).replaceAll("$other", other)).all() as { label: string; starts_at: string }[])
        .map((r) => ({ what, label: `${r.label}, ${shortDate(r.starts_at)}` }));
    const terms = `SELECT t.title AS label, t.starts_at FROM $from.terms t WHERE t.id NOT IN (SELECT id FROM $other.terms) ORDER BY t.starts_at`;
    const bookings = `SELECT b.name || ' (' || b.people || ' os.) – ' || COALESCE(t.title, '?') AS label, COALESCE(t.starts_at, b.created_at) AS starts_at
      FROM $from.bookings b LEFT JOIN $from.terms t ON t.id = b.term_id WHERE b.id NOT IN (SELECT id FROM $other.bookings) ORDER BY b.created_at`;
    const interest = `SELECT i.name || ' (' || i.people || ' os.) – ' || COALESCE(t.title, '?') AS label, COALESCE(t.starts_at, i.created_at) AS starts_at
      FROM $from.interest i LEFT JOIN $from.terms t ON t.id = i.term_id
      WHERE NOT EXISTS (SELECT 1 FROM $other.interest o WHERE o.term_id = i.term_id AND o.email = i.email) ORDER BY i.created_at`;
    const side = (from: "main" | "src", other: "main" | "src") =>
      [...list(terms, "termin", from, other), ...list(bookings, "rezerwacja", from, other), ...list(interest, "chętny", from, other)];
    // rows on both sides whose content differs (the carried markers don't count)
    const differing = (t: string) => {
      const cols = columns(db, "main", t).filter((c) => !(c in (CARRIED[t]?.cols ?? {}))).map((c) => `"${c}"`).join(", ");
      const key = (CARRIED[t]?.key ?? ["id"]).map((c) => `"${c}"`).join(", ");
      return `SELECT ${key} FROM (SELECT ${cols} FROM main.${t} EXCEPT SELECT ${cols} FROM src.${t}) INTERSECT SELECT ${key} FROM src.${t}`;
    };
    const changed = (db.prepare(`SELECT COUNT(*) AS n FROM (${differing("interest")})`).get() as { n: number }).n;
    const termRows = db.prepare(`SELECT m.title, m.starts_at, m.status AS now_status, s.status AS was_status
      FROM main.terms m JOIN src.terms s ON s.id = m.id WHERE m.id IN (${differing("terms")}) ORDER BY m.starts_at`).all() as
      { title: string; starts_at: string; now_status: TermStatus; was_status: TermStatus }[];
    const changedTerms = termRows.map((r): Change => ({
      what: "termin",
      label: `${r.title}, ${shortDate(r.starts_at)}: ${r.now_status === r.was_status ? "inne dane (np. data, godziny, cena) wrócą do wersji z kopii" : `teraz ${TERM_STATUS[r.now_status]}, po przywróceniu ${TERM_STATUS[r.was_status]}`}`,
    }));
    const uncancelled = termRows.some((r) => r.now_status === "cancelled" && r.was_status !== "cancelled");
    const rows = db.prepare(`SELECT m.name, m.people, COALESCE(t.title, '?') AS title, COALESCE(t.starts_at, m.created_at) AS starts_at,
        m.term_id != s.term_id AS moved, COALESCE(st.title, '?') AS was_title, COALESCE(st.starts_at, s.created_at) AS was_starts_at,
        m.status AS now_status, s.status AS was_status, m.paid_at IS NOT NULL AS now_paid, s.paid_at IS NOT NULL AS was_paid
      FROM main.bookings m JOIN src.bookings s ON s.id = m.id LEFT JOIN main.terms t ON t.id = m.term_id LEFT JOIN src.terms st ON st.id = s.term_id
      WHERE m.id IN (${differing("bookings")}) ORDER BY m.created_at`).all() as
      { name: string; people: number; title: string; starts_at: string; moved: number; was_title: string; was_starts_at: string;
        now_status: string; was_status: string; now_paid: number; was_paid: number }[];
    const state = (status: string, paid: number) => `${BOOKING_STATUS[status] ?? status}${paid ? ", opłacona" : ""}`;
    const changedBookings = rows.map((r): Change => {
      const now = state(r.now_status, r.now_paid);
      const was = state(r.was_status, r.was_paid);
      const what = [
        ...(r.moved ? [`wróci na termin ${r.was_title}, ${shortDate(r.was_starts_at)}`] : []),
        ...(now !== was ? [`teraz ${now}, po przywróceniu ${was}`] : []),
      ];
      return { what: "rezerwacja", label: `${r.name} (${r.people} os.) – ${r.title}, ${shortDate(r.starts_at)}: ${what.length ? what.join("; ") : "inne dane wrócą do wersji z kopii"}` };
    });
    return { lost: side("main", "src"), back: side("src", "main"), changedTerms, uncancelled, changedBookings, changed };
  });
}

/** Runs the restore if the link is valid and the typed date matches. Uses the link up before anything else. */
export function restoreWithLink(token: string, typed: string): { copy: string; safety: string } {
  const target = linkTarget(token);
  if ("error" in target) throw new UserError(target.error);
  const { copy } = target;
  if (typed.trim() !== confirmPhrase(copy)) throw new UserError(`Wpisz datę kopii dokładnie tak: ${confirmPhrase(copy)}.`, 422);
  const db = getDb();
  const used = db.prepare("UPDATE restore_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").run(nowIso(), hash(token), nowIso());
  if (used.changes !== 1) throw new UserError("Ten link został już wykorzystany albo wygasł. Poproś o nowy w panelu (Kopie).");
  const safety = restoreCopy(copy);
  const label = copyLabel(copy);
  enqueue(restoreDone(config.mailNotify, label, safety), ...(config.mailAdmin ? [restoreDone(config.mailAdmin, label, safety)] : []));
  console.log(`[restore] database restored from ${copy.name}; the state before is in ${safety}`);
  return { copy: label, safety };
}

/** Saves the current state, then replaces the RESTORED tables with the copy's in one transaction. Returns the safety copy's name. */
function restoreCopy(copy: Copy): string {
  const db = getDb();
  checkTables(db, "main");
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Warsaw" }).replace(" ", "-").replaceAll(":", "");
  const safety = `db-przed-przywroceniem-${stamp}.sqlite`;
  // written under a temp name and renamed once the restore is in, so a restore that fails or is cut
  // short never leaves a "state before" for a restore that didn't happen (tick.ts removes the temp file)
  const part = tempFile();
  let committed = false;
  try {
    withCopy(copy, () => tx(db, () => {
      // the current state, read by a second connection while this one holds the write lock: nothing
      // another process commits can fall between this file and the restore. VACUUM INTO writes one
      // consistent, compact file and only reads the database.
      const snap = new DatabaseSync(config.databasePath, { readOnly: true });
      try {
        snap.exec("PRAGMA busy_timeout = 5000");
        snap.prepare("VACUUM INTO ?").run(part);
      } finally {
        snap.close();
      }
      // the copy's rows only make sense together; foreign keys are checked at the commit
      db.exec("PRAGMA defer_foreign_keys = ON");
      for (const [t, c] of Object.entries(CARRIED)) {
        const keep = [...new Set([...c.key, ...Object.values(c.cols).flat(), ...Object.keys(c.cols)])];
        db.exec(`CREATE TEMP TABLE carry_${t} AS SELECT ${keep.join(", ")} FROM main.${t}`);
      }
      for (const t of RESTORED) {
        const cols = columns(db, "main", t);
        if (cols.join() !== columns(db, "src", t).join()) throw new Error(`restore: table ${t} differs between the copy and the database`);
        const list = cols.map((c) => `"${c}"`).join(", ");
        db.exec(`DELETE FROM main.${t}; INSERT INTO main.${t} (${list}) SELECT ${list} FROM src.${t};`);
      }
      for (const [t, c] of Object.entries(CARRIED)) {
        const set = Object.entries(c.cols).map(([col, about]) => {
          const match = [...c.key, ...about].map((k) => `c.${k} IS ${t}.${k}`).join(" AND ");
          return `${col} = COALESCE(${col}, (SELECT c.${col} FROM temp.carry_${t} c WHERE ${match}))`;
        });
        db.exec(`UPDATE main.${t} SET ${set.join(", ")}`);
      }
      const since = madeNoLaterThan(copy).toISOString();
      for (const sql of SENT_FROM_OUTBOX) db.prepare(sql).run({ since });
      // a withdrawal empties phone and notes (interest.ts); a row withdrawn since the copy has them back from it
      db.exec("UPDATE main.interest SET phone = NULL, notes = NULL WHERE withdrawn_at IS NOT NULL AND (phone IS NOT NULL OR notes IS NOT NULL)");
      for (const t of Object.keys(CARRIED)) db.exec(`DROP TABLE temp.carry_${t}`);
    }));
    committed = true;
    renameSync(part, join(backupDir(), safety));
  } finally {
    if (!committed) rmSync(part, { force: true });
  }
  // the copy may hold rows past their retention date; the clean-up runs per process, so run it here.
  // The restore is in by now: a failure here must not report it as failed (the hourly clean-up retries).
  try {
    cleanup();
  } catch (e) {
    console.error("[restore] clean-up after the restore failed; the hourly one will retry", e);
  }
  return safety;
}

/** A temp file in backups/ (same disk, so it can be renamed); never listed as a copy, see RESTORE_TEMP. */
const tempFile = () => join(backupDir(), `${RESTORE_TEMP}${randomBytes(6).toString("hex")}.sqlite`);

/**
 * Copies the file to a temp file, checks it, brings it to the current schema and attaches it as "src"
 * for `fn`. The files in backups/ are never opened for writing.
 */
function withCopy<T>(copy: Copy, fn: (db: DatabaseSync) => T): T {
  const tmp = tempFile();
  try {
    copyFileSync(copy.path, tmp);
    prepare(tmp);
    const db = getDb();
    db.prepare("ATTACH DATABASE ? AS src").run(tmp);
    try {
      return fn(db);
    } finally {
      db.exec("DETACH DATABASE src");
    }
  } finally {
    for (const f of ["", "-wal", "-shm", "-journal"]) rmSync(tmp + f, { force: true });
  }
}

function prepare(file: string): void {
  let conn: DatabaseSync | undefined;
  try {
    conn = new DatabaseSync(file);
    const check = conn.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (check.integrity_check !== "ok") throw new UserError("Ta kopia jest uszkodzona (nie przeszła sprawdzenia). Wybierz inną.");
    const { user_version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
    if (user_version > SCHEMA_VERSION) throw new UserError("Ta kopia pochodzi z nowszej wersji strony niż ta, która teraz działa.");
    migrate(conn);
    checkTables(conn, "main");
  } catch (e) {
    if (e instanceof UserError) throw e;
    // "file is not a database" and the like
    if ((e as { code?: string }).code === "ERR_SQLITE_ERROR") throw new UserError("Ta kopia jest uszkodzona (to nie jest poprawna baza). Wybierz inną.");
    throw e;
  } finally {
    conn?.close();
  }
}

function columns(db: DatabaseSync, schema: string, table: string): string[] {
  return (db.prepare(`PRAGMA ${schema}.table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function checkTables(db: DatabaseSync, schema: string): void {
  const names = (db.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map((r) => r.name);
  const unknown = names.filter((n) => !RESTORED.includes(n) && !KEPT.includes(n));
  if (unknown.length) throw new Error(`restore: tables not classified in restore.ts: ${unknown.join(", ")}`);
  const missing = RESTORED.filter((n) => !names.includes(n));
  if (missing.length) throw new UserError("Ta kopia jest niepełna (brakuje w niej tabel). Wybierz inną.");
}
