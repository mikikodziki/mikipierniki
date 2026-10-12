/**
 * Server settings. Values come from the environment (on the VPS: /etc/mikipierniki.env,
 * locally: .env). Nothing here ends up in the browser.
 */
import {
  BANK_ACCOUNT, BANK_RECIPIENT, CRON_TOKEN, DATABASE_PATH, MAIL_FROM, MAIL_NOTIFY,
  PANEL_PASSWORD, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER, STUDIO_ADDRESS,
} from "astro:env/server";

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const config = {
  dev: import.meta.env.DEV,
  siteUrl: (import.meta.env.SITE ?? "https://mikipierniki.pl").replace(/\/$/, ""),
  databasePath: clean(DATABASE_PATH) ?? "data/mikipierniki.sqlite",
  smtp: clean(SMTP_HOST)
    ? { host: SMTP_HOST!, port: SMTP_PORT ?? 587, user: clean(SMTP_USER), pass: clean(SMTP_PASS) }
    : undefined,
  /** Sender of every e-mail; replies land in the same inbox */
  mailFrom: clean(MAIL_FROM) ?? "Miki Pierniki <warsztaty@mikipierniki.pl>",
  /** Where Dominika gets notified about new sign-ups and inquiries */
  mailNotify: clean(MAIL_NOTIFY) ?? "warsztaty@mikipierniki.pl",
  panelPassword: clean(PANEL_PASSWORD),
  cronToken: clean(CRON_TOKEN),
  bankAccount: clean(BANK_ACCOUNT),
  bankRecipient: clean(BANK_RECIPIENT),
  /** The street address is never published on the site; it only goes out in booking e-mails */
  studioAddress: clean(STUDIO_ADDRESS),
};

/** What is still missing before a term can take bookings (transfer details and the address go into the confirmation). */
export function bookingBlockers(): string[] {
  const missing: string[] = [];
  if (!config.bankAccount) missing.push("numer konta (BANK_ACCOUNT)");
  if (!config.bankRecipient) missing.push("odbiorca przelewu (BANK_RECIPIENT)");
  if (!config.studioAddress) missing.push("adres pracowni (STUDIO_ADDRESS)");
  return missing;
}
