// Makes every width <Photo> asks for from one source photo.
// Usage: node scripts/zdjecia.mjs <source image> <name>   → public/zdjecia/<name>-<width>.webp
import sharp from "sharp";

const [src, name] = process.argv.slice(2);
if (!src || !name) {
  console.error("Usage: node scripts/zdjecia.mjs <source image> <name>");
  process.exit(1);
}

// keep in sync with src/components/Photo.astro: 400 and 800 for phones, plus widths (default 600, 1000, 1600)
const { width = 0, height = 0, orientation = 1 } = await sharp(src).metadata();
// EXIF orientations 5–8 are rotated a quarter turn, so the visible width is the stored height
const sourceWidth = orientation >= 5 ? height : width;
if (sourceWidth < 1000) {
  console.error(`Source is ${sourceWidth}px wide; <Photo> needs at least 1000px.`);
  process.exit(1);
}
// a narrower source tops out at its own width instead of a stretched 1600
const top = Math.min(sourceWidth, 1600);
for (const width of [400, 600, 800, 1000, top]) {
  const out = `public/zdjecia/${name}-${width}.webp`;
  await sharp(src).rotate().resize({ width }).webp({ quality: 75, effort: 6 }).toFile(out);
  console.log(out);
}
if (top < 1600) console.log(`Use <Photo name="${name}" widths={[600, 1000, ${top}]} …>`);
