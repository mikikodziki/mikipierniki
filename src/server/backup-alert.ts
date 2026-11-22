/**
 * E-mails Dominika (and, as a separate message, the administrator) when the nightly copy has a
 * problem: once per problem, not every minute. Every app process runs this from its tick, so the
 * check and the note of what was sent happen in one write transaction.
 */
import { backupState } from "./backups";
import { config } from "./config";
import { getDb, tx } from "./db";
import { backupAlert } from "./emails";
import { enqueue } from "./mail";

const KEY = "backup_alert";

export function checkBackupAlert(): void {
  const { problem } = backupState(1);
  // a problem is the same problem while its words are the same; "" = all fine, so the next problem mails again
  const now = problem ? `${problem.level}: ${problem.text}` : "";
  const db = getDb();
  tx(db, () => {
    const was = (db.prepare("SELECT value FROM app_state WHERE key = ?").get(KEY) as { value: string } | undefined)?.value ?? "";
    if (was === now) return;
    db.prepare("INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT DO UPDATE SET value = excluded.value").run(KEY, now);
    if (!problem) return;
    if (!config.mailAdmin) return enqueue(backupAlert(config.mailNotify, problem, ""));
    enqueue(backupAlert(config.mailNotify, problem, "do administratora strony"), backupAlert(config.mailAdmin, problem, "do Dominiki"));
  });
}
