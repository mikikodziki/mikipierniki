// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  // Z tej domeny generują się canonical, og:url i JSON-LD.
  site: "https://mikipierniki.pl",
  trailingSlash: "never",
  // CSS goes into each page (a few KB), so the first paint waits on no extra request.
  build: { format: "file", inlineStylesheets: "always" },
});
