// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  // Domena nie jest jeszcze ustalona. Po jej wyborze wpisz ją tutaj,
  // a canonical, og:url i JSON-LD zaczną się generować same.
  // site: "https://mikipierniki.pl",
  trailingSlash: "never",
  build: { format: "file" },
});
