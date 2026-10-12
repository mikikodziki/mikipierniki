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
  // Our middleware checks the origin itself, because one-click unsubscribe POSTs from mail apps carry none.
  security: { checkOrigin: false },
  env: {
    schema: {
      DATABASE_PATH: secret(),
      SMTP_HOST: secret(),
      SMTP_PORT: envField.number({ context: "server", access: "secret", optional: true }),
      SMTP_USER: secret(),
      SMTP_PASS: secret(),
      MAIL_FROM: secret(),
      MAIL_NOTIFY: secret(),
      PANEL_PASSWORD: secret(),
      CRON_TOKEN: secret(),
      BANK_ACCOUNT: secret(),
      BANK_RECIPIENT: secret(),
      STUDIO_ADDRESS: secret(),
    },
  },
});
