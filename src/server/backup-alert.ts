/**
 * E-mails Dominika (and, as a separate message, the administrator) when the nightly copy has a
 * problem: once per problem and then once a day while it lasts, not every minute (a copy that fails
 * the same way every night must not go quiet after the first mail). Every app process runs this from
 * its tick, so the check and the note of what was sent happen in one write transaction.
 */
import { backupState } from "./backups";
import { config } from "./config";
import { getDb, tx } from "./db";
import { backupAlert } from "./emails";
import { enqueue } from "./mail";

const KEY = "backup_alert";
const SENT_AT = "backup_alert_sent_at";
const AGAIN_MS = 24 * 60 * 60 * 1000;

export function checkBackupAlert(): void {
  const { problem } = backupState(1);
  // a problem is the same problem while its words are the same; "" = all fine, so the next problem mails again
  const now = problem ? `${problem.level}: ${problem.text}` : "";
  const db = getDb();
  tx(db, () => {
    const get = (key: string) => (db.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? "";
    const set = (key: string, value: string) =>
      db.prepare("INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT DO UPDATE SET value = excluded.value").run(key, value);
    if (get(KEY) === now && (!problem || Date.now() - (Date.parse(get(SENT_AT)) || 0) < AGAIN_MS)) return;
    set(KEY, now);
    if (!problem) return;
    set(SENT_AT, new Date().toISOString());
    if (!config.mailAdmin) return enqueue(backupAlert(config.mailNotify, problem, ""));
    enqueue(backupAlert(config.mailNotify, problem, "do administratora strony"), backupAlert(config.mailAdmin, problem, "do Dominiki"));
  });
}
