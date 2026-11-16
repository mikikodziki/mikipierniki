// Draws the frost on the hero's window: ice ferns that grow in from the left
// edge and from each other, thick at the edge and thinning out towards a
// ragged front line, a granular rime along the edge, and a few fir-like
// dendrites that reach out over the photo.
//
//   node scripts/szron.mjs        → public/szron.svg
//
// The drawing is seeded, so running it again gives exactly the same frost.
// Change SEED for a different pattern.
import { writeFileSync } from "node:fs";

const SEED = 1611;
const W = 1400;
const H = 800;

let s = SEED >>> 0;
const rnd = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const R = (a, b) => a + (b - a) * rnd();
const pick = (...xs) => xs[Math.floor(rnd() * xs.length)];
const f = (v) => {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? "0" : String(r).replace(/^(-?)0\./, "$1.");
};
// relative pair, with the separator only where the sign doesn't supply one
const rel = (dx, dy) => {
  const a = f(dx);
  const b = f(dy);
  return a + (b.startsWith("-") ? "" : " ") + b;
};

// where the frost gives out: a ragged line a little past the middle
const front = (y) =>
  W * (0.56 + 0.045 * Math.sin(y / 93 + 1.3) + 0.03 * Math.sin(y / 37 + 0.4) + 0.015 * Math.sin(y / 17));

// strokes are bucketed by weight and by how far "in front" the crystal is
const WEIGHT = { stem: 1.1, barb: 0.62, fine: 0.4 };
const ALPHA = { far: 0.24, mid: 0.45, near: 0.75 };
const paths = {};
const add = (weight, alpha, d) => ((paths[`${weight}|${alpha}`] ??= []).push(d));

const inBounds = (x, y) => x > -80 && x < W + 80 && y > -80 && y < H + 80;

/** a short stroke that bends back towards the direction of growth */
function barb(x, y, a, len, bend, weight, alpha) {
  const cx = Math.cos(a) * len * 0.55;
  const cy = Math.sin(a) * len * 0.55;
  const ea = a - bend;
  const ex = cx + Math.cos(ea) * len * 0.45;
  const ey = cy + Math.sin(ea) * len * 0.45;
  add(weight, alpha, `M${Math.round(x)} ${Math.round(y)}q${rel(cx, cy)} ${rel(ex, ey)}`);
}

/**
 * Fern frost: a long, gently curving stem combed with fine barbs, mostly on
 * one side. New ferns sprout from its flank, so the frost grows as one mat.
 */
function fern(x, y, a, len, gen, alpha, overshoot = R(0, 50)) {
  const step = 3;
  const n = Math.max(3, Math.round(len / step));
  const bend = R(-1.2, 1.2) / n;
  const side = rnd() < 0.7 ? pick(1, -1) : 0;
  const reach = Math.min(60, len * R(0.12, 0.2));
  const spacing = R(3.5, 4.8);
  const angle = R(0.5, 0.78);
  const curl = R(0.12, 0.32);
  let px = x;
  let py = y;
  let d = `M${f(px)} ${f(py)}`;
  let comb = 0;
  let nextBarb = spacing;
  let nextSprout = R(40, 90);
  let swell = 1;
  let flip = 1;
  for (let i = 1; i <= n; i++) {
    a += bend + R(-0.015, 0.015);
    const dx = Math.cos(a) * step;
    const dy = Math.sin(a) * step;
    px += dx;
    py += dy;
    if (!inBounds(px, py) || px > front(py) + overshoot) break;
    d += `l${rel(dx, dy)}`;
    comb += step;
    const t = i / n;
    // barb length wanders slowly, so the comb looks grown, not ruled
    swell = Math.min(1.2, Math.max(0.65, swell + R(-0.08, 0.08)));
    if (comb >= nextBarb) {
      comb = 0;
      nextBarb = spacing * R(0.8, 1.25);
      const env = Math.min(1, t * 7) * (1 - 0.75 * t ** 2.2);
      flip = -flip;
      for (const sd of side === 0 ? [flip] : [side]) {
        const bl = reach * env * swell;
        if (bl > 1.5) barb(px, py, a + sd * angle * R(0.9, 1.1), bl, sd * curl, "barb", alpha);
      }
    }
    nextSprout -= step;
    if (nextSprout <= 0 && gen < 3) {
      nextSprout = R(45, 110);
      if (rnd() < 0.5) {
        const rest = (n - i) * step;
        fern(px, py, a + pick(1, -1) * R(0.35, 0.95), Math.max(60, rest * R(0.5, 0.95)), gen + 1, pick("far", "mid", alpha));
      }
    }
  }
  add(gen === 0 ? "stem" : "barb", alpha, d);
}

/**
 * A fir-tree dendrite: a straight spine, side arms at sixty degrees that are
 * longest at the base, each arm bristling with tiny needles.
 */
function dendrite(x, y, a, len, alpha) {
  const step = 3;
  const n = Math.round(len / step);
  const bend = R(-0.35, 0.35) / n;
  let px = x;
  let py = y;
  let d = `M${f(px)} ${f(py)}`;
  let nextArm = R(4, 8);
  let flip = pick(1, -1);
  for (let i = 1; i <= n; i++) {
    a += bend + R(-0.02, 0.02);
    const dx = Math.cos(a) * step;
    const dy = Math.sin(a) * step;
    px += dx;
    py += dy;
    if (!inBounds(px, py)) break;
    d += `l${rel(dx, dy)}`;
    nextArm -= step;
    if (nextArm > 0) continue;
    nextArm = R(6, 10);
    const t = i / n;
    flip = -flip;
    const armLen = Math.min(70, len * 0.3) * (1 - t) ** 0.9 * R(0.45, 1.1);
    if (armLen < 3 || rnd() < 0.12) continue;
    const aa = a + flip * R(0.95, 1.15);
    const ax = Math.cos(aa) * armLen;
    const ay = Math.sin(aa) * armLen;
    add("barb", alpha, `M${Math.round(px)} ${Math.round(py)}l${rel(ax, ay)}`);
    // needles along the arm, pointing outwards
    for (let u = 0.2; u < 0.95; u += R(0.1, 0.18)) {
      const nl = armLen * 0.28 * (1 - u) * R(0.6, 1.2);
      if (nl < 1.2) continue;
      const nx = px + ax * u;
      const ny = py + ay * u;
      for (const sd of [1, -1]) {
        const na = aa + sd * R(0.9, 1.15);
        add("fine", alpha, `M${Math.round(nx)} ${Math.round(ny)}l${rel(Math.cos(na) * nl, Math.sin(na) * nl)}`);
      }
    }
  }
  add("barb", alpha, d);
}

// the left edge, where the frost starts and is thickest
for (let y = -40; y < H + 40; y += R(24, 42)) {
  fern(R(-50, 0), y, R(-0.75, 0.75), R(380, 820), 0, pick("far", "mid", "mid", "near"));
}
// creeping in along the top and the bottom of the left half
for (let x = -20; x < W * 0.42; x += R(50, 90)) {
  fern(x, R(-40, -5), R(0.3, 1.3), R(160, 380), 0, pick("far", "mid", "near"));
  fern(x + R(-25, 25), H + R(5, 40), -R(0.3, 1.3), R(160, 380), 0, pick("far", "mid", "near"));
}
// fir-like crystals running out from the front line over the photo
// (rooted well inside the mat, so they grow out of it rather than float)
for (let y = 10; y < H; y += R(48, 86)) {
  const x = front(y) - R(260, 380);
  dendrite(x, y, R(-0.6, 0.6), R(300, 460), pick("mid", "near", "near"));
}

const strokes = Object.entries(paths)
  .map(([key, ds]) => {
    const [weight, alpha] = key.split("|");
    return `<path stroke-width="${WEIGHT[weight]}" stroke-opacity="${ALPHA[alpha]}" d="${ds.join("")}"/>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<!-- generated by scripts/szron.mjs, do not edit by hand -->
<defs>
  <linearGradient id="edge" x2="1">
    <stop offset="0" stop-color="#fff"/>
    <stop offset=".07" stop-color="#fff" stop-opacity=".55"/>
    <stop offset=".22" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="haze" x2="1">
    <stop offset="0" stop-color="#F2F5F7" stop-opacity=".3"/>
    <stop offset=".12" stop-color="#F2F5F7" stop-opacity=".12"/>
    <stop offset=".32" stop-color="#F2F5F7" stop-opacity="0"/>
  </linearGradient>
  <filter id="rime" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 .95  0 0 0 0 .97  0 0 0 0 1  7 0 0 0 -4" result="specks"/>
    <feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves="3" seed="3" result="clumps"/>
    <feColorMatrix in="clumps" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  4 0 0 0 -1.4" result="patch"/>
    <feComposite in="specks" in2="patch" operator="in" result="rime"/>
    <feComposite in="rime" in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="glow" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="soft"/>
    <feComponentTransfer in="soft" result="halo"><feFuncA type="linear" slope="1.3"/></feComponentTransfer>
    <feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#haze)"/>
<rect width="${W}" height="${H}" fill="url(#edge)" filter="url(#rime)"/>
<g fill="none" stroke="#F3F7FA" stroke-linecap="round" filter="url(#glow)">
${strokes}
</g>
</svg>
`;

writeFileSync(new URL("../public/szron.svg", import.meta.url), svg);
console.log(`public/szron.svg: ${(svg.length / 1024).toFixed(0)} KB`);
