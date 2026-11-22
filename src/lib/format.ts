import type { Term, WorkshopType } from "./types";

const TZ = "Europe/Warsaw";

const dayFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", timeZone: TZ });
const monthFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const yearFmt = new Intl.DateTimeFormat("pl-PL", { year: "numeric", timeZone: TZ });

export const day = (iso: string) => dayFmt.format(new Date(iso));
/** Genitive month name, e.g. "listopada" */
export const month = (iso: string) => monthFmt.format(new Date(iso)).replace(/^\d+\s/, "");
export const weekday = (iso: string) => weekdayFmt.format(new Date(iso));
export const timeRange = (t: Pick<Term, "startsAt" | "endsAt">) =>
  `${timeFmt.format(new Date(t.startsAt))}–${timeFmt.format(new Date(t.endsAt))}`;
export const shortDate = (iso: string) => `${day(iso)} ${month(iso)}`;
/** "20 grudnia", or "9 stycznia 2027" in another year than today in Poland, so a term after New Year never reads as a past date */
export const termDate = (iso: string, now = new Date()) => {
  const year = yearFmt.format(new Date(iso));
  return year === yearFmt.format(now) ? shortDate(iso) : `${shortDate(iso)} ${year}`;
};

/** "450 zł" with a no-break space, so the amount never ends a line without its "zł" */
export const pln = (n: number) => `${n}\u00a0zł`;

/**
 * Page copy only (mail texts stay plain): keeps "35 zł" and ranges like "3–4" or "11:00–15:00" in one
 * piece at a line end, with a no-break space before "zł" and a word joiner after the dash.
 */
export const glue = (s: string) => s.replace(/(\d) zł/g, "$1\u00a0zł").replace(/(\d)–(?=\d)/g, "$1–\u2060");

/** Polish plural: 1 miejsce, 2–4 miejsca, 5+ miejsc (12–14 → miejsc) */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
}

export const seatsWord = (n: number) => plural(n, "miejsce", "miejsca", "miejsc");

export const workshopTypeLabel: Record<WorkshopType, string> = {
  dorosli: "Dla dorosłych",
  dzieci: "Dla dzieci",
  wieczor: "Wieczorne",
};

export const LOW_SEATS = 3;
