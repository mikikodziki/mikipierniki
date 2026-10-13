// Lists the content that still has to be filled in before the site goes public:
// example testimonials, business data in `legal` (src/lib/site.ts), "DO UZUPEŁNIENIA" markers
// and the [notes] left for the lawyer in the legal pages. Exits with 1 while anything is left.
// Usage: npm run check:launch
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repo = new URL("..", import.meta.url).pathname;
const src = join(repo, "src");
const read = (p) => readFileSync(join(repo, p), "utf8");
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.(astro|ts|mjs)$/.test(f) ? [p] : [];
});
const lines = (p) => readFileSync(p, "utf8").split("\n").map((text, i) => ({ at: `${relative(repo, p)}:${i + 1}`, text }));

const sections = [];
const add = (title, items) => items.length && sections.push({ title, items });

// 1. Testimonials: shown as genuine reviews, so examples must never go live
const mock = lines(join(src, "lib/mock-data.ts"));
add("Opinie na stronie głównej są PRZYKŁADOWE (zmyślone opinie nie mogą trafić na stronę)", mock
  .filter((l) => l.text.includes("PRZYKŁADOWE"))
  .map((l) => `${l.at}  wstaw prawdziwe opinie (za zgodą autorów) albo zostaw pustą tablicę: sekcja wtedy znika`));

// 2. Business data for the regulamin and the privacy policy
const site = read("src/lib/site.ts");
const block = site.slice(site.indexOf("export const legal"), site.indexOf("};", site.indexOf("export const legal")));
const legal = [...block.matchAll(/^\s*(\w+):\s*(.+?),?$/gm)];
add("Dane działalności w `legal` (src/lib/site.ts)", [
  ...legal.filter(([, , v]) => v.includes("[")).map(([, k, v]) => `${k}: ${v}`),
  ...legal.filter(([, k, v]) => k === "draft" && v.startsWith("true")).map(() => "draft: true  (zmień na false, gdy prawnik przeczyta regulamin i politykę)"),
]);

// 3. Open questions marked in the code
const all = files(src).flatMap(lines);
add("Do uzupełnienia w treści", all
  .filter((l) => l.text.includes("DO UZUPEŁNIENIA"))
  .map((l) => `${l.at}  ${l.text.replace(/.*DO UZUPEŁNIENIA:?\s*/, "").replace(/\s*(-->|\*\/)\s*$/, "")}`));

// 4. Notes for the lawyer, visible on the page until resolved
add("Uwagi dla prawnika widoczne na stronie", all
  .filter((l) => /\[(Do|do) (weryfikacji|ustalenia|aktualizacji)/.test(l.text))
  .map((l) => `${l.at}  ${l.text.match(/\[(?:Do|do) [^\]]+\]/)[0].slice(0, 110)}`));

if (sections.length === 0) {
  console.log("Wszystko uzupełnione. Pamiętaj jeszcze o ustawieniach na serwerze (deploy/env.example).");
  process.exit(0);
}
for (const s of sections) {
  console.log(`\n${s.title}`);
  for (const i of s.items) console.log(`  - ${i}`);
}
console.log(`\nZostało: ${sections.reduce((n, s) => n + s.items.length, 0)}. Ustawienia serwera (konto, adres pracowni, poczta) sprawdza panel.`);
process.exit(1);
