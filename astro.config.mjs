// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://mikipierniki.pl",
  trailingSlash: "never",
  build: { format: "file" },
});
