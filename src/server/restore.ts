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
 * and nobody who withdrew comes back.
 */
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { shortDate } from "@/lib/format";
import { backupDir, type BackupCopy, confirmPhrase, copyLabel, findCopy } from "./backups";
import { config } from "./config";
import { getDb, migrate, nowIso, SCHEMA_VERSION, tx } from "./db";
import { restoreDone, restoreLink } from "./emails";
import { UserError } from "./http";
import { enqueue, underHourlyCap } from "./mail";
import { cleanup } from "./tick";

/** Every table is in exactly one list; a table in neither stops the restore, so a new one can't default silently. */
const RESTORED = ["terms", "bookings", "interest", "term_stats"];
const KEPT = ["outbox", "subscribers", "consent_log", "inquiries", "stats_views", "stats_hours", "stats_forms", "stats_meta", "app_state", "restore_links"];
/** Columns that record a mail sent or a withdrawal: taken from now when the copy has none. */
const CARRIED: Record<string, { key: string[]; cols: string[] }> = {
  bookings: { key: ["id"], cols: ["reminded_at", "overdue_notified_at"] },
  interest: { key: ["term_id", "email"], cols: ["notified_at", "withdrawn_at"] },
};
/**
 * A row deleted since the copy comes back without those markers, but its mail is still in the outbox
 * (kept, and sent mail stays there 30 days, as long as the copies). Matched on what the templates in
 * emails.ts put in each mail: the booking number, or the term link at the end of its line.
 */
const SENT_FROM_OUTBOX = `
  UPDATE main.bookings SET reminded_at = (SELECT MIN(o.created_at) FROM main.outbox o WHERE o.kind = 'booking-reminder'
    AND o.status IN ('pending', 'sent') AND o.to_addr = bookings.email AND instr(o.text, bookings.id) > 0) WHERE reminded_at IS NULL;
  UPDATE main.bookings SET overdue_notified_at = (SELECT MIN(o.created_at) FROM main.outbox o WHERE o.kind = 'booking-overdue'
    AND o.status IN ('pending', 'sent') AND instr(o.subject, bookings.id) > 0) WHERE overdue_notified_at IS NULL;
  UPDATE main.interest SET notified_at = (SELECT MIN(o.created_at) FROM main.outbox o WHERE o.kind = 'term-opened'
    AND o.status IN ('pending', 'sent') AND o.to_addr = interest.email AND instr(o.text, 'termin=' || interest.term_id || char(10)) > 0) WHERE notified_at IS NULL;
`;
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
  /** in both, but different (counted, not listed) */
  changed: number;
}

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
    let changed = 0;
    for (const t of ["terms", "bookings", "interest"]) {
      const cols = columns(db, "main", t).filter((c) => !CARRIED[t]?.cols.includes(c)).map((c) => `"${c}"`).join(", ");
      const key = (CARRIED[t]?.key ?? ["id"]).map((c) => `"${c}"`).join(", ");
      // rows on both sides whose content differs (the carried markers don't count)
      changed += (db.prepare(`SELECT COUNT(*) AS n FROM (SELECT ${key} FROM (SELECT ${cols} FROM main.${t} EXCEPT SELECT ${cols} FROM src.${t})
        INTERSECT SELECT ${key} FROM src.${t})`).get() as { n: number }).n;
    }
    return { lost: side("main", "src"), back: side("src", "main"), changed };
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
  return withCopy(copy, () => {
    // the current state first; VACUUM INTO writes one consistent, compact file
    const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Warsaw" }).replace(" ", "-").replaceAll(":", "");
    const safety = `db-przed-przywroceniem-${stamp}.sqlite`;
    db.prepare("VACUUM main INTO ?").run(join(backupDir(), safety));
    tx(db, () => {
      // the copy's rows only make sense together; foreign keys are checked at the commit
      db.exec("PRAGMA defer_foreign_keys = ON");
      for (const [t, c] of Object.entries(CARRIED)) {
        db.exec(`CREATE TEMP TABLE carry_${t} AS SELECT ${[...c.key, ...c.cols].join(", ")} FROM main.${t}`);
      }
      for (const t of RESTORED) {
        const cols = columns(db, "main", t);
        if (cols.join() !== columns(db, "src", t).join()) throw new Error(`restore: table ${t} differs between the copy and the database`);
        const list = cols.map((c) => `"${c}"`).join(", ");
        db.exec(`DELETE FROM main.${t}; INSERT INTO main.${t} (${list}) SELECT ${list} FROM src.${t};`);
      }
      for (const [t, c] of Object.entries(CARRIED)) {
        const match = c.key.map((k) => `c.${k} = ${t}.${k}`).join(" AND ");
        const set = c.cols.map((col) => `${col} = COALESCE(${col}, (SELECT c.${col} FROM temp.carry_${t} c WHERE ${match}))`).join(", ");
        db.exec(`UPDATE main.${t} SET ${set}; DROP TABLE temp.carry_${t};`);
      }
      db.exec(SENT_FROM_OUTBOX);
    });
    // the copy may hold rows past their retention date; the clean-up runs per process, so run it here
    cleanup();
    return safety;
  });
}

/**
 * Copies the file to a temp file next to the database, checks it, brings it to the current schema and
 * attaches it as "src" for `fn`. The files in backups/ are never opened for writing.
 */
function withCopy<T>(copy: Copy, fn: (db: DatabaseSync) => T): T {
  const tmp = join(backupDir(), "..", `.restore-${randomBytes(6).toString("hex")}.sqlite`);
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
