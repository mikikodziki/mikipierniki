/**
 * Visit statistics without cookies, scripts or visitor identifiers (docs/analityka.md).
 *
 * deploy/start.mjs watches the requests the server answers and leaves a short note per page view
 * and per form post in a buffer in memory. Every minute `collectHits` turns the notes into daily
 * sums: page, source (the referring site's name only), utm_* tags, phone or computer, hour.
 * The IP address and the full browser string are never stored, and nothing ties two page views
 * to one person, so the sums hold no personal data and are kept without a time limit.
 */
import { outbound } from "@/lib/outbound";
import { config } from "./config";
import { getDb, tx } from "./db";

/** One answered request, as deploy/start.mjs records it. */
export interface RawHit {
  at: number;
  method: string;
  url: string;
  status: number;
  referer?: string;
  ua?: string;
  purpose?: string;
  mobile?: string;
}

const BUFFER = Symbol.for("mikipierniki.hits");
/** How much of the address and the Referer deploy/start.mjs keeps; a parameter at the cut may be shortened */
const URL_KEPT = 512;
const REFERER_KEPT = 256;
/** Drops the last query parameter of a value that was cut, so a shortened utm tag is never stored */
const uncut = (v: string | undefined, kept: number) => (v && v.length >= kept ? v.replace(/[?&][^?&]*$/, "") : v);
/** The buffer limit in deploy/start.mjs */
const BUFFER_MAX = 10_000;
/** Past this many distinct rows a day, new sources and tags are counted as "(inne)" (keeps the file small). */
const MAX_ROWS_PER_DAY = 1000;
/** The same private pages deploy/start.mjs skips; checked again here, also for the page a form was sent from */
const PRIVATE = /^\/(panel|zapis|newsletter)(\/|\.|$)/i;

const SITE_HOSTS = new Set([new URL(config.siteUrl).host, `www.${new URL(config.siteUrl).host}`]);

/** Link previews, crawlers, monitors and scripts; real browsers don't say any of this. */
const BOT = /bot|crawl|spider|slurp|scrap|preview|monitor|check|curl|wget|python|java\/|go-http|okhttp|axios|node|headless|phantom|lighthouse|pagespeed|facebookexternalhit|meta-external|whatsapp|telegram|discord|skype|embedly|uptime|pingdom|semrush|ahrefs|yandex|baidu|petal|bytespider|gpt|claude|perplexity|ccbot|applebot/i;

/** Referring sites shown under one name; anything else is shown by its address. */
const SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "Facebook"],
  [/^com\.google\.android\.gm$|^mail\.google\.com$/, "Gmail"],
  [/(^|\.)google\.[a-z.]{2,7}$|^com\.google\.android\.googlequicksearchbox$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/(^|\.)yahoo\.com$/, "Yahoo"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/^(t\.co|x\.com|twitter\.com)$/, "X"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)pinterest\.[a-z.]{2,7}$/, "Pinterest"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
];
export const DIRECT = "(bezpośrednio)";
export const OTHER = "(inne)";
const UNKNOWN_PAGE = "(nieznana)";

/** Forms counted by the API path they post to */
export const FORMS = ["zainteresowanie", "rezerwacja", "zapytanie", "newsletter"] as const;
export type Form = (typeof FORMS)[number];
export type Outcome = "wyslane" | "odrzucone" | "nieaktualne" | "wylaczone" | "blad";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
});
/** Day (YYYY-MM-DD) and hour in Poland */
export function localDay(at: number): { day: string; hour: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

/** A utm_* value as a short lowercase tag; anything odd becomes "(inne)". */
function tag(v: string | null): string {
  if (!v) return "";
  const t = v.trim().toLowerCase().replace(/\s+/g, "-");
  if (!t) return "";
  return /^[a-z0-9._-]{1,40}$/.test(t) ? t : OTHER;
}

/** The path a page view is counted under, or null when it isn't one. */
function pagePath(rawPath: string, status: number): string | null {
  if (status === 404) return "(404)";
  if (status >= 500) return "(błąd)";
  if (status >= 400) return null;
  let p = rawPath;
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  p = p.toLowerCase().replace(/\.html$/, "").replace(/\/index$/, "/").replace(/\/+$/, "") || "/";
  if (PRIVATE.test(p)) return null;
  // an outbound click is the redirect itself, and only for a name on our list; any other /do/
  // address (e.g. "/do/anything/", which gets a trailing-slash redirect) is not counted
  if (p.startsWith("/do/")) return status === 302 && Object.hasOwn(outbound, p.slice(4)) ? p : null;
  // other redirects (e.g. a trailing slash) are counted where they lead
  if (status >= 300 && status !== 304) return null;
  return /^\/[a-z0-9/-]{0,60}$/.test(p) ? p : null;
}

function parseUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw, config.siteUrl);
  } catch {
    return null;
  }
}

/** Where a visit came from: one of our pages (null) or the name of the referring site. */
function sourceOf(referer: string | undefined): string | null {
  const u = referer ? parseUrl(referer) : null;
  if (!referer || !u) return DIRECT;
  const host = u.host.toLowerCase();
  if (SITE_HOSTS.has(host)) return null;
  const named = SOURCES.find(([re]) => re.test(host));
  if (named) return named[1];
  const bare = host.replace(/^www\./, "").replace(/:\d+$/, "");
  // a site's name, not a bare IP address
  return /^[a-z0-9.-]{1,60}$/.test(bare) && !/^[\d.]+$/.test(bare) ? bare : OTHER;
}

function outcomeOf(status: number): Outcome | null {
  if (status >= 200 && status < 300) return "wyslane";
  if (status === 409 || status === 404) return "nieaktualne";
  if (status === 503) return "wylaczone";
  if (status >= 500) return "blad";
  // 403 is a post from another site (refused before the form ran), not a visitor's attempt
  if (status === 403) return null;
  return "odrzucone";
}

/** A real page of the site, as opposed to an outbound click (/do/*) or the (404) and (błąd) buckets */
const isPage = (path: string) => path.startsWith("/") && !path.startsWith("/do/");
/** The same test in SQL, for the reports */
const PAGE_SQL = "path LIKE '/%' AND path NOT LIKE '/do/%'";

const isPhone = (h: RawHit) => h.mobile === "?1" || /Mobi|Android|iPhone|iPad|iPod/.test(h.ua ?? "");

type ViewRow = { day: string; path: string; source: string; us: string; um: string; uc: string; device: string; views: number; entries: number };
type HourRow = { day: string; hour: number; views: number; entries: number };
type FormRow = { day: string; form: string; page: string; us: string; outcome: string; count: number };

/** Moves the buffered requests into the daily sums. Returns how many requests it looked at. */
export function collectHits(): number {
  const buffer = (globalThis as Record<symbol, RawHit[] | undefined>)[BUFFER];
  if (!buffer?.length) return 0;
  const batch = buffer.splice(0, buffer.length);
  const sums = sumUp(batch);
  try {
    save(sums);
  } catch (e) {
    // the database refused (e.g. locked): put the notes back for the next minute, within the limit
    buffer.unshift(...batch.slice(0, Math.max(0, BUFFER_MAX - buffer.length)));
    throw e;
  }
  return batch.length;
}

interface Sums { views: Map<string, ViewRow>; hours: Map<string, HourRow>; forms: Map<string, FormRow>; lastView: number }

function sumUp(batch: RawHit[]): Sums {
  const views = new Map<string, ViewRow>();
  const hours = new Map<string, HourRow>();
  const forms = new Map<string, FormRow>();
  let lastView = 0;

  for (const h of batch) {
    if (!h.ua || BOT.test(h.ua)) continue;
    const url = parseUrl(uncut(h.url, URL_KEPT));
    if (!url) continue;
    const { day, hour } = localDay(h.at);

    if (h.method === "GET") {
      if (/prefetch|prerender/i.test(h.purpose ?? "")) continue;
      const path = pagePath(url.pathname, h.status);
      if (!path) continue;
      const source = sourceOf(h.referer);
      const entry = source !== null ? 1 : 0;
      const row: ViewRow = {
        day, path, source: source ?? "", device: isPhone(h) ? "telefon" : "komputer",
        us: tag(url.searchParams.get("utm_source")), um: tag(url.searchParams.get("utm_medium")), uc: tag(url.searchParams.get("utm_campaign")),
        views: 1, entries: entry,
      };
      const k = [row.day, row.path, row.source, row.us, row.um, row.uc, row.device].join("\u0000");
      const had = views.get(k);
      if (had) { had.views++; had.entries += entry; } else views.set(k, row);
      if (isPage(path)) {
        const hk = `${day}\u0000${hour}`;
        const hh = hours.get(hk);
        if (hh) { hh.views++; hh.entries += entry; } else hours.set(hk, { day, hour, views: 1, entries: entry });
      }
      lastView = Math.max(lastView, h.at);
    } else if (h.method === "POST") {
      const form = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "") as Form;
      if (!FORMS.includes(form)) continue;
      const outcome = outcomeOf(h.status);
      if (!outcome) continue;
      // the page the form was sent from, and the utm_source it was opened with
      const ref = parseUrl(uncut(h.referer, REFERER_KEPT));
      const internal = ref && SITE_HOSTS.has(ref.host.toLowerCase());
      const page = (internal && pagePath(ref.pathname, 200)) || UNKNOWN_PAGE;
      const us = internal ? tag(ref.searchParams.get("utm_source")) : "";
      const k = [day, form, page, us, outcome].join("\u0000");
      const had = forms.get(k);
      if (had) had.count++; else forms.set(k, { day, form, page, us, outcome, count: 1 });
    }
  }
  return { views, hours, forms, lastView };
}

function save({ views, hours, forms, lastView }: Sums): void {
  const db = getDb();
  tx(db, () => {
    const rowsToday = db.prepare("SELECT COUNT(*) AS n FROM stats_views WHERE day = ?");
    const exists = db.prepare("SELECT 1 FROM stats_views WHERE day = ? AND path = ? AND source = ? AND utm_source = ? AND utm_medium = ? AND utm_campaign = ? AND device = ?");
    const addView = db.prepare(`INSERT INTO stats_views (day, path, source, utm_source, utm_medium, utm_campaign, device, views, entries)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET views = views + excluded.views, entries = entries + excluded.entries`);
    // rows per day, counted as new ones are added, so one batch can't run past the limit either
    const viewRows = new Map<string, number>();
    const known = (v: string) => (v === "" || v === DIRECT || SOURCES.some(([, name]) => name === v) ? v : OTHER);
    for (const r of views.values()) {
      if (!viewRows.has(r.day)) viewRows.set(r.day, (rowsToday.get(r.day) as { n: number }).n);
      if (!exists.get(r.day, r.path, r.source, r.us, r.um, r.uc, r.device)) {
        if (viewRows.get(r.day)! >= MAX_ROWS_PER_DAY) {
          // past the limit only the page, a named source and the device stay apart
          r.source = known(r.source);
          r.us = r.us && OTHER; r.um = r.um && OTHER; r.uc = r.uc && OTHER;
        }
        if (!exists.get(r.day, r.path, r.source, r.us, r.um, r.uc, r.device)) viewRows.set(r.day, viewRows.get(r.day)! + 1);
      }
      addView.run(r.day, r.path, r.source, r.us, r.um, r.uc, r.device, r.views, r.entries);
    }
    const addHour = db.prepare(`INSERT INTO stats_hours (day, hour, views, entries) VALUES (?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET views = views + excluded.views, entries = entries + excluded.entries`);
    for (const r of hours.values()) addHour.run(r.day, r.hour, r.views, r.entries);
    const formRowsToday = db.prepare("SELECT COUNT(*) AS n FROM stats_forms WHERE day = ?");
    const formExists = db.prepare("SELECT 1 FROM stats_forms WHERE day = ? AND form = ? AND page = ? AND utm_source = ? AND outcome = ?");
    const addForm = db.prepare(`INSERT INTO stats_forms (day, form, page, utm_source, outcome, count) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET count = count + excluded.count`);
    const formRows = new Map<string, number>();
    for (const r of forms.values()) {
      if (!formRows.has(r.day)) formRows.set(r.day, (formRowsToday.get(r.day) as { n: number }).n);
      if (!formExists.get(r.day, r.form, r.page, r.us, r.outcome)) {
        if (formRows.get(r.day)! >= MAX_ROWS_PER_DAY) {
          r.page = OTHER;
          r.us = r.us && OTHER;
        }
        if (!formExists.get(r.day, r.form, r.page, r.us, r.outcome)) formRows.set(r.day, formRows.get(r.day)! + 1);
      }
      addForm.run(r.day, r.form, r.page, r.us, r.outcome, r.count);
    }
    if (lastView) {
      // to the minute: enough to see that counting works after a deploy
      db.prepare("INSERT INTO stats_meta (key, value) VALUES ('last_view_at', ?) ON CONFLICT DO UPDATE SET value = excluded.value")
        .run(new Date(lastView - (lastView % 60_000)).toISOString());
    }
  });
}

/* ---------- reports for the panel ---------- */

export interface TrafficReport {
  views: number;
  entries: number;
  daily: { day: string; views: number; entries: number }[];
  sources: { source: string; entries: number }[];
  campaigns: { source: string; medium: string; campaign: string; entries: number; views: number }[];
  pages: { path: string; views: number; entries: number }[];
  devices: { device: string; entries: number; views: number }[];
  /** entries by weekday (0 = Monday) and hour */
  week: number[][];
  lastViewAt: string | null;
  firstDay: string | null;
}

/** Sums since `from` (YYYY-MM-DD, inclusive), or over everything when null. */
export function trafficReport(from: string | null): TrafficReport {
  const db = getDb();
  const since = from ?? "0000-00-00";
  const all = <T>(sql: string) => db.prepare(sql).all(since) as unknown as T[];
  const totals = db.prepare(`SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(entries), 0) AS entries FROM stats_views WHERE day >= ? AND ${PAGE_SQL}`)
    .get(since) as { views: number; entries: number };
  const week = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of all<{ day: string; hour: number; entries: number }>("SELECT day, hour, entries FROM stats_hours WHERE day >= ?")) {
    const dow = (new Date(`${r.day}T12:00:00Z`).getUTCDay() + 6) % 7;
    week[dow][r.hour] += r.entries;
  }
  return {
    ...totals,
    daily: all(`SELECT day, SUM(views) AS views, SUM(entries) AS entries FROM stats_views WHERE day >= ? AND ${PAGE_SQL} GROUP BY day ORDER BY day`),
    sources: all(`SELECT source, SUM(entries) AS entries FROM stats_views WHERE day >= ? AND ${PAGE_SQL} AND entries > 0 GROUP BY source ORDER BY entries DESC, source`),
    campaigns: all(`SELECT utm_source AS source, utm_medium AS medium, utm_campaign AS campaign, SUM(entries) AS entries, SUM(views) AS views
      FROM stats_views WHERE day >= ? AND ${PAGE_SQL} AND (utm_source != '' OR utm_medium != '' OR utm_campaign != '')
      GROUP BY utm_source, utm_medium, utm_campaign ORDER BY entries DESC, views DESC`),
    pages: all("SELECT path, SUM(views) AS views, SUM(entries) AS entries FROM stats_views WHERE day >= ? GROUP BY path ORDER BY views DESC, path"),
    devices: all(`SELECT device, SUM(entries) AS entries, SUM(views) AS views FROM stats_views WHERE day >= ? AND ${PAGE_SQL} GROUP BY device ORDER BY entries DESC`),
    week,
    lastViewAt: (db.prepare("SELECT value FROM stats_meta WHERE key = 'last_view_at'").get() as { value: string } | undefined)?.value ?? null,
    firstDay: (db.prepare("SELECT MIN(day) AS d FROM stats_views").get() as { d: string | null }).d,
  };
}

export interface FormReport {
  /** per form: how many posts ended how */
  outcomes: { form: string; outcome: string; count: number }[];
  /** sent forms by the page they were sent from */
  pages: { form: string; page: string; count: number }[];
  /** sent forms by the utm_source of that page ("" = none) */
  sources: { form: string; source: string; count: number }[];
}

export function formReport(from: string | null): FormReport {
  const db = getDb();
  const since = from ?? "0000-00-00";
  const all = <T>(sql: string) => db.prepare(sql).all(since) as unknown as T[];
  return {
    outcomes: all("SELECT form, outcome, SUM(count) AS count FROM stats_forms WHERE day >= ? GROUP BY form, outcome"),
    pages: all("SELECT form, page, SUM(count) AS count FROM stats_forms WHERE day >= ? AND outcome = 'wyslane' GROUP BY form, page ORDER BY count DESC"),
    sources: all("SELECT form, utm_source AS source, SUM(count) AS count FROM stats_forms WHERE day >= ? AND outcome = 'wyslane' GROUP BY form, utm_source ORDER BY count DESC"),
  };
}

