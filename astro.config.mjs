// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  // Z tej domeny generują się canonical, og:url i JSON-LD.
  site: "https://mikipierniki.pl",
  trailingSlash: "never",
  build: { format: "file" },
});
