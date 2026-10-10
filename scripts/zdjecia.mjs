// Makes every width <Photo> asks for from one source photo.
// Usage: node scripts/zdjecia.mjs <source image> <name>   → public/zdjecia/<name>-<width>.webp
import sharp from "sharp";

const [src, name] = process.argv.slice(2);
if (!src || !name) {
  console.error("Usage: node scripts/zdjecia.mjs <source image> <name>");
  process.exit(1);
}

// keep in sync with the srcset in src/components/Photo.astro
for (const width of [400, 600, 800, 1000, 1600]) {
  const out = `public/zdjecia/${name}-${width}.webp`;
  await sharp(src).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 75, effort: 6 }).toFile(out);
  console.log(out);
}
