import { randomBytes } from "node:crypto";

/** Unguessable link token (192 bits) for withdraw/unsubscribe/confirm links. */
export const token = () => randomBytes(24).toString("base64url");

/** Short booking reference people can type into a transfer title, e.g. "MP-7K3QX9". */
export function bookingRef(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(6);
  return "MP-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const normalizeEmail = (s: string) => s.trim().toLowerCase();

/** Offset of Europe/Warsaw at a given instant, e.g. "+01:00". */
function warsawOffset(at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "+00:00";
}

/** "2026-11-14" + "11:00" in Warsaw → "2026-11-14T11:00:00+01:00" */
export function warsawIso(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  // the offset at the guessed instant is right except within an hour of a DST switch, which is never a workshop time
  const offset = warsawOffset(new Date(guess.getTime() - 60 * 60 * 1000));
  return `${date}T${time}:00${offset}`;
}

/** "2026-11-14T11:00:00+01:00" → { date: "2026-11-14", time: "11:00" } in Warsaw time. */
export function warsawParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
  const [date, time] = parts.split(" ");
  return { date, time };
}
