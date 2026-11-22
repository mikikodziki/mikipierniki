// Startup file of the CloudLinux "Node.js App" on seohost; LiteSpeed starts it (see deploy/README.md).
// Settings and passwords live in ../mikipierniki-data/.env, outside public_html: environment
// variables set in the panel would be written into public_html/.htaccess.
import { existsSync } from "node:fs";

process.loadEnvFile(new URL("../mikipierniki-data/.env", import.meta.url));

// Astro starts its own server unless told not to. We start the same server ourselves only to watch
// the requests it answers: prebuilt pages never reach Astro's middleware, so this is where page
// views are seen. Nothing is stored here; src/server/stats.ts collects the buffer every minute.
// A deploy rollback restores only dist/, so this must also work with a build that never collects.
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { startServer } = await import("./dist/server/entry.mjs");
const started = startServer();

const MAX = 10_000;
const hits = (globalThis[Symbol.for("mikipierniki.hits")] ??= []);
// pages opened from a mail link (/zapis, /newsletter) carry a personal token; the panel is private
const PRIVATE = /^\/(panel|zapis|newsletter)(\/|\.|$)/i;
// A buffered note keeps only the start of each field, as a real copy: a plain slice would keep the
// whole header string alive (V8 shares the memory), so 10 000 long requests would hold ~300 MB.
// Header strings are latin1, so the copy is exact.
const cut = (v, n) => (typeof v === "string" ? Buffer.from(v.slice(0, n), "latin1").toString("latin1") : undefined);

const http = started?.server?.server;
if (typeof http?.prependListener === "function") {
  http.prependListener("request", (req, res) => {
    const target = req.url ?? "";
    const raw = target.split("?")[0];
    let path;
    try {
      // only addresses already in their plain form (no "/./", "//", "%2e" or "http://host/" targets),
      // so the private test below sees the page the server will actually answer
      if (new URL(target, "http://localhost").pathname !== raw) return;
      path = decodeURIComponent(raw);
    } catch {
      return;
    }
    if (PRIVATE.test(path)) return;
    const h = req.headers;
    const nav = req.method === "GET" && h["sec-fetch-dest"] === "document" && h["sec-fetch-mode"] === "navigate";
    const form = req.method === "POST" && path.startsWith("/api/");
    if (!nav && !form) return;
    const at = Date.now();
    res.once("finish", () => {
      if (hits.length >= MAX) return;
      hits.push({
        at, method: req.method, url: cut(target, 512), status: res.statusCode,
        referer: cut(h.referer, 256), ua: cut(h["user-agent"], 300), purpose: cut(h["sec-purpose"] ?? h.purpose, 40), mobile: cut(h["sec-ch-ua-mobile"], 8),
      });
    });
  });
} else {
  console.error("[stats] the Astro server was not found, page views are not counted");
}

// Headers for every answer, set before Astro writes its own. Astro sends its headers with writeHead,
// so on the same name its value wins: the panel's no-store and the mail-link pages'
// "referrer-policy: same-origin" stay as the middleware sets them.
const SECURITY = {
  // https only. 30 days to begin with: the Let's Encrypt certificate renews itself, but no renewal
  // has run on this domain yet (first one ~January 2027); raise to a year once one has
  "strict-transport-security": "max-age=2592000",
  "x-content-type-options": "nosniff",
  // no other site may show these pages in a frame (a click on a hidden form or panel button)
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
// Photos and fonts keep their names across deploys (only /_astro/ files carry a content hash), so
// without this every page view asks again for each of them. Fonts don't change: a year. A photo
// replaced under the same name shows up within a week.
const CACHED = [
  [/^\/fonts\/[\w.-]+\.woff2$/, "public, max-age=31536000, immutable"],
  [/^\/zdjecia\/[\w.-]+\.(?:webp|jpe?g|png|avif)$/, "public, max-age=604800"],
];
const client = new URL("./dist/client/", import.meta.url);
if (typeof http?.prependListener === "function") {
  http.prependListener("request", (req, res) => {
    for (const [name, value] of Object.entries(SECURITY)) res.setHeader(name, value);
    if (req.method !== "GET" && req.method !== "HEAD") return;
    const path = (req.url ?? "").split("?")[0];
    const rule = CACHED.find(([re]) => re.test(path));
    // only for a file that exists: a missing photo gets the 404 page, which must not be kept for a week
    if (rule && existsSync(new URL(`.${path}`, client))) res.setHeader("cache-control", rule[1]);
  });
} else {
  console.error("[headers] the Astro server was not found, security and cache headers are not set");
}
