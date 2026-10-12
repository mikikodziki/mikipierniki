/**
 * Runs for server-rendered routes only (prerendered pages pass straight through):
 * - starts the background worker (mail queue, reminders, clean-up),
 * - rejects form posts from other sites (CSRF),
 * - protects /panel with a password (HTTP Basic, PANEL_PASSWORD).
 */
import { timingSafeEqual } from "node:crypto";
import { defineMiddleware } from "astro:middleware";
import { config } from "./server/config";
import { ensureWorker } from "./server/tick";

/** Mail apps send one-click unsubscribes without an Origin; unsubscribing by token is harmless. */
const ORIGIN_FREE = new Set(["/newsletter/wypisz"]);

function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === url.origin || origin === config.siteUrl;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

function passwordOk(request: Request, password: string): boolean {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const given = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const want = Buffer.from(password);
  return given.length === want.length && timingSafeEqual(given, want);
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.isPrerendered) return next();
  ensureWorker();

  const { request, url } = ctx;
  const path = url.pathname.replace(/\/$/, "");

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !ORIGIN_FREE.has(path) && !sameOrigin(request, url)) {
    return new Response("Formularz wysłany z innej strony.", { status: 403 });
  }

  const isPanel = path === "/panel" || path.startsWith("/panel/");
  if (isPanel) {
    if (!config.panelPassword) {
      if (!config.dev) return new Response("Panel jest wyłączony: ustaw PANEL_PASSWORD na serwerze.", { status: 503 });
    } else if (!passwordOk(request, config.panelPassword)) {
      return new Response("Podaj hasło do panelu.", {
        status: 401,
        headers: { "www-authenticate": 'Basic realm="Panel Miki Pierniki", charset="UTF-8"' },
      });
    }
  }

  const res = await next();
  if (isPanel || path.startsWith("/api/")) {
    try {
      res.headers.set("cache-control", "no-store");
      res.headers.set("x-robots-tag", "noindex, nofollow");
    } catch {
      // redirects built with Response.redirect have immutable headers; they carry no data anyway
    }
  }
  return res;
});
