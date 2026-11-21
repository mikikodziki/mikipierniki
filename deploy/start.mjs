// Startup file of the CloudLinux "Node.js App" on seohost; LiteSpeed starts it (see deploy/README.md).
// Settings and passwords live in ../mikipierniki-data/.env, outside public_html: environment
// variables set in the panel would be written into public_html/.htaccess.
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
// a buffered note keeps only what the statistics read, so a full buffer stays a few MB
const cut = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);

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
        at, method: req.method, url: cut(target, 1024), status: res.statusCode,
        referer: cut(h.referer, 512), ua: cut(h["user-agent"], 400), purpose: cut(h["sec-purpose"] ?? h.purpose, 40), mobile: cut(h["sec-ch-ua-mobile"], 8),
      });
    });
  });
} else {
  console.error("[stats] the Astro server was not found, page views are not counted");
}
