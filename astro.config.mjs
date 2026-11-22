// @ts-check
import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";

const secret = (optional = true) => envField.string({ context: "server", access: "secret", optional });

export default defineConfig({
  // Z tej domeny generują się canonical, og:url i JSON-LD.
  site: "https://mikipierniki.pl",
  trailingSlash: "never",
  // CSS goes into each page (a few KB), so the first paint waits on no extra request.
  build: { format: "file", inlineStylesheets: "always" },
  // Pages stay prerendered; only routes with `prerender = false` (terms, forms, panel) run on the server.
  adapter: node({ mode: "standalone" }),
  security: {
    // Our middleware checks the origin itself, because one-click unsubscribe POSTs from mail apps carry none.
    checkOrigin: false,
    // Since Astro 7.4 a request's address takes its host from the Host header only for these; any
    // other host reads as "localhost", and the middleware's origin check would refuse every form.
    // Production is reached as mikipierniki.pl (LiteSpeed redirects www); the other two are the
    // local server and the e2e run.
    allowedDomains: [{ hostname: "mikipierniki.pl" }, { hostname: "127.0.0.1" }, { hostname: "localhost" }],
  },
  env: {
    schema: {
      DATABASE_PATH: secret(),
      SMTP_HOST: secret(),
      SMTP_PORT: envField.number({ context: "server", access: "secret", optional: true }),
      SMTP_USER: secret(),
      SMTP_PASS: secret(),
      MAIL_FROM: secret(),
      MAIL_NOTIFY: secret(),
      /** "1" writes e-mails to data/mail/ instead of sending (local preview, tests) */
      MAIL_TO_FILES: secret(),
      PANEL_PASSWORD: secret(),
      CRON_TOKEN: secret(),
      BANK_ACCOUNT: secret(),
      BANK_RECIPIENT: secret(),
      STUDIO_ADDRESS: secret(),
    },
  },
});
