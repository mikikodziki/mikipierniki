/**
 * The nightly database copies made by deploy/backup.sh, read for the panel (Kopie), its warning bar
 * and the backup alert e-mail. This file only reads: the copies kept on the server and what each
 * night's run wrote to backup.log. It cannot see the copies in S3 (the server may only send them
 * there, see backup.sh). Restoring a copy is in restore.ts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config";

/** A copy older than this means last night's run did not happen or failed (the run itself takes seconds). */
const STALE_MS = 26 * 60 * 60 * 1000;
/**
 * The copy file appears seconds before its log line, and the S3 upload may take up to 5 minutes
 * (curl -m 300), while cron.sh starts in the same minute: a newer copy without a line counts only after this.
 */
const RUN_GRACE_MS = 15 * 60 * 1000;
/** backup.sh names the server copy by day; .gz and backup.err exist only for a moment during a run. */
const COPY = /^db-(\d{4}-\d{2}-\d{2})\.sqlite$/;
/**
 * The database as it was just before a restore from the panel (restore.ts), so a restore can be undone.
 * backup.sh's 30-day clean-up (db-*.sqlite*) removes these too; the health check ignores them.
 */
const SAFETY = /^db-przed-przywroceniem-(\d{4}-\d{2}-\d{2})-\d{6}\.sqlite$/;
/**
 * Temp files of a restore (restore.ts): the copy being checked and the state before it, both full copies
 * of the database. A restore cut short leaves them behind; tick.ts removes those after an hour. The dot
 * keeps them out of the list above and out of backup.sh's clean-up (db-*).
 */
export const RESTORE_TEMP = ".restore-";
/** One line per run: "2026-11-22 03:30:04 ok: …" or "… FAILED: …", in the server's time (Warsaw). */
const LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2} (ok|FAILED): (.*)$/;

export interface BackupCopy {
  /** the file name in backups/ */
  name: string;
  kind: "nightly" | "safety";
  day: string;
  /** the file's time: when it was written here (staleness and the 03:30 grace go by this) */
  madeAt: Date;
  /**
   * false when the file's time is not on the day in its name, i.e. a copy brought back from S3: then
   * the file's time is when it was copied in, and only the day in the name says when it was made
   */
  exact: boolean;
  bytes: number;
}

export interface BackupRun {
  /** "2026-11-22": the day in the copy's file name */
  day: string;
  /** "22.11.2026, 03:30", Warsaw time as written in the log */
  at: string;
  ok: boolean;
  /** the server copy exists after this run */
  copy: boolean;
  s3: "sent" | "off" | "failed";
  /** what happened, in Polish; never the raw line, since a failed upload carries S3's reply */
  text: string;
}

export interface BackupState {
  /** false when backups were never set up on this machine (e.g. a laptop) */
  configured: boolean;
  /** nightly copies, newest first */
  copies: BackupCopy[];
  /** states saved just before a restore, newest first */
  safety: BackupCopy[];
  /** newest first */
  runs: BackupRun[];
  /** "bad": no copy from the last day; "warn": there is one, but the newest run failed or skipped S3 */
  problem: { level: "bad" | "warn"; text: string } | null;
}

/** Reads one run from its log line; unknown lines still count, as failures, so nothing hides a problem. */
function parseRun(line: string): BackupRun | null {
  const m = LINE.exec(line.trim());
  if (!m) return null;
  const [, day, time, result, rest] = m;
  const [y, mo, d] = day.split("-");
  const at = `${d}.${mo}.${y}, ${time}`;
  if (result === "ok") {
    return rest.includes("+ S3")
      ? { day, at, ok: true, copy: true, s3: "sent", text: "Kopia na serwerze i w S3." }
      : { day, at, ok: true, copy: true, s3: "off", text: "Kopia jest tylko na serwerze, bo wysyłka do S3 nie jest ustawiona." };
  }
  if (rest.startsWith("S3 upload")) {
    // "S3 upload of db-…: 403 <S3's reply>"; only the status code is shown
    const code = /^S3 upload of \S+: (\d{3}|curl error)/.exec(rest)?.[1];
    const why = code === "403" ? " (kod 403: zwykle zmiana adresu IP serwera)" : code ? ` (${code === "curl error" ? "brak połączenia" : `kod ${code}`})` : "";
    return { day, at, ok: false, copy: true, s3: "failed", text: `Kopia na serwerze jest, ale nie trafiła do S3${why}.` };
  }
  if (rest.startsWith("gzip")) return { day, at, ok: false, copy: true, s3: "failed", text: "Kopia na serwerze jest, ale nie udało się jej spakować do wysyłki do S3." };
  // a failed copy or check leaves that day's file broken or half-written
  if (rest.startsWith("integrity check")) return { day, at, ok: false, copy: false, s3: "failed", text: "Kopia nie przeszła sprawdzenia (może być uszkodzona)." };
  if (rest.startsWith("sqlite3")) return { day, at, ok: false, copy: false, s3: "failed", text: "Nie udało się zrobić kopii." };
  return { day, at, ok: false, copy: false, s3: "failed", text: "Nieznany błąd: szczegóły w backup.log na serwerze." };
}

export const backupDir = () => join(dirname(config.databasePath), "backups");

function readCopies(dir: string): BackupCopy[] {
  if (!existsSync(dir)) return [];
  const copies: BackupCopy[] = [];
  for (const name of readdirSync(dir)) {
    const nightly = COPY.exec(name)?.[1];
    const day = nightly ?? SAFETY.exec(name)?.[1];
    if (!day) continue;
    try {
      const s = statSync(join(dir, name));
      const exact = s.mtime.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" }) === day;
      copies.push({ name, kind: nightly ? "nightly" : "safety", day, madeAt: s.mtime, exact, bytes: s.size });
    } catch {
      // removed by the 30-day clean-up while we were reading
    }
  }
  // newest first, by the name (one nightly file per day, a same-day re-run overwrites it; safety copies carry the time)
  return copies.sort((a, b) => b.name.localeCompare(a.name));
}

/** A copy the panel may restore: only a name from the listing, so no path from a form ever reaches the disk. */
export function findCopy(name: string): (BackupCopy & { path: string }) | undefined {
  const dir = backupDir();
  const c = readCopies(dir).find((x) => x.name === name);
  return c && { ...c, path: join(dir, c.name) };
}

/** When a copy was made, as people read it: "20.11.2026, 03:30", or only the day when the time is not known. */
export function copyWhen(c: BackupCopy): string {
  return c.exact ? c.madeAt.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : confirmPhrase(c);
}

/** How a copy is named to people: by when it was made. */
export function copyLabel(c: BackupCopy): string {
  return c.kind === "nightly" ? `kopia z ${copyWhen(c)}` : `stan sprzed przywrócenia, ${copyWhen(c)}`;
}

/** No later than the copy was made: its time, or the start of the day in its name (+02:00 is never after Warsaw's midnight). */
export const madeNoLaterThan = (c: BackupCopy): Date => (c.exact ? c.madeAt : new Date(`${c.day}T00:00:00+02:00`));

/** What has to be typed to confirm a restore: the copy's day as people write it. */
export const confirmPhrase = (c: BackupCopy) => c.day.split("-").reverse().join(".");

/** The log gains one short line a night (about 35 KB a year), so reading it whole is fine. */
function readRuns(log: string, limit: number): BackupRun[] {
  if (!existsSync(log)) return [];
  const runs: BackupRun[] = [];
  for (const line of readFileSync(log, "utf8").split("\n")) {
    const run = parseRun(line);
    if (run) runs.push(run);
  }
  return runs.slice(-limit).reverse();
}

/** For a sentence continued after a colon. */
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Runs on every panel page (the warning bar), so a file it cannot read becomes a warning, never an error page. */
export function backupState(limit = 30, now = Date.now()): BackupState {
  const dir = backupDir();
  const log = join(dirname(config.databasePath), "backup.log");
  const configured = existsSync(dir) || existsSync(log);
  let all: BackupCopy[];
  let runs: BackupRun[];
  try {
    all = readCopies(dir);
    runs = readRuns(log, limit);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "nieznany błąd";
    return { configured, copies: [], safety: [], runs: [], problem: { level: "bad", text: `Panel nie może odczytać kopii na serwerze (${code}).` } };
  }
  const copies = all.filter((c) => c.kind === "nightly");
  const safety = all.filter((c) => c.kind === "safety");
  return { configured, copies, safety, runs, problem: configured ? judge(copies, runs, now) : null };
}

/** Judged by the newest copy first, not by the log: a dead crontab writes no line at all. */
function judge(copies: BackupCopy[], runs: BackupRun[], now: number): BackupState["problem"] {
  const newest = copies[0];
  const last = runs[0];
  if (!newest || now - newest.madeAt.getTime() > STALE_MS) {
    return { level: "bad", text: `Nie ma kopii bazy z ostatniej doby.${last && !last.ok ? ` Ostatnia próba ${last.at}: ${lowerFirst(last.text)}` : ""}` };
  }
  if (last && !last.copy) return { level: "bad", text: `Ostatnia próba ${last.at}: ${lowerFirst(last.text)}` };
  // the script stopped after the copy but before its log line, so S3 is unknown (or it is still running)
  if (!last || last.day !== newest.day) {
    if (now - newest.madeAt.getTime() < RUN_GRACE_MS) return last && !last.ok ? { level: "warn", text: last.text } : null;
    return { level: "warn", text: "Najnowsza kopia jest na serwerze, ale serwer nie zapisał, czy trafiła do S3." };
  }
  // on the server S3 is expected; "off" means backup.env is gone
  if (!last.ok || last.s3 === "off") return { level: "warn", text: last.text };
  return null;
}
