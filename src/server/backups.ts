/**
 * The nightly database copies made by deploy/backup.sh, read for the panel (Kopie) and its warning bar.
 * Read-only: the panel lists the copies kept on the server and what each night's run wrote to
 * backup.log. It cannot see the copies in S3 (the server may only send them there, see backup.sh)
 * and it never restores; that is done on the server by hand (deploy/README.md).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config";

/** A copy older than this means last night's run did not happen or failed (the run itself takes seconds). */
const STALE_MS = 26 * 60 * 60 * 1000;
/** backup.sh names the server copy by day; .gz and backup.err exist only for a moment during a run. */
const COPY = /^db-(\d{4}-\d{2}-\d{2})\.sqlite$/;
/** One line per run: "2026-11-22 03:30:04 ok: …" or "… FAILED: …", in the server's time (Warsaw). */
const LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2} (ok|FAILED): (.*)$/;

export interface BackupCopy {
  day: string;
  madeAt: Date;
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
  copies: BackupCopy[];
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

function readCopies(dir: string): BackupCopy[] {
  if (!existsSync(dir)) return [];
  const copies: BackupCopy[] = [];
  for (const name of readdirSync(dir)) {
    const day = COPY.exec(name)?.[1];
    if (!day) continue;
    try {
      const s = statSync(join(dir, name));
      copies.push({ day, madeAt: s.mtime, bytes: s.size });
    } catch {
      // removed by the 30-day clean-up while we were reading
    }
  }
  // newest first, by the day in the name (one file per day; a same-day re-run overwrites it)
  return copies.sort((a, b) => b.day.localeCompare(a.day));
}

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
  const data = dirname(config.databasePath);
  const dir = join(data, "backups");
  const log = join(data, "backup.log");
  const configured = existsSync(dir) || existsSync(log);
  let copies: BackupCopy[];
  let runs: BackupRun[];
  try {
    copies = readCopies(dir);
    runs = readRuns(log, limit);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "nieznany błąd";
    return { configured, copies: [], runs: [], problem: { level: "bad", text: `Panel nie może odczytać kopii na serwerze (${code}).` } };
  }
  return { configured, copies, runs, problem: configured ? judge(copies, runs, now) : null };
}

/** Judged by the newest copy first, not by the log: a dead crontab writes no line at all. */
function judge(copies: BackupCopy[], runs: BackupRun[], now: number): BackupState["problem"] {
  const newest = copies[0];
  const last = runs[0];
  if (!newest || now - newest.madeAt.getTime() > STALE_MS) {
    return { level: "bad", text: `Nie ma kopii bazy z ostatniej doby.${last && !last.ok ? ` Ostatnia próba ${last.at}: ${lowerFirst(last.text)}` : ""}` };
  }
  if (last && !last.copy) return { level: "bad", text: `Ostatnia próba ${last.at}: ${lowerFirst(last.text)}` };
  // the script stopped after the copy but before its log line, so S3 is unknown
  if (!last || last.day !== newest.day) return { level: "warn", text: "Najnowsza kopia jest na serwerze, ale serwer nie zapisał, czy trafiła do S3." };
  // on the server S3 is expected; "off" means backup.env is gone
  if (!last.ok || last.s3 === "off") return { level: "warn", text: last.text };
  return null;
}
