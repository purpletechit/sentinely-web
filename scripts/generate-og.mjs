// Generates raster assets (favicons, app icons, OG image) from SVG using sharp.
// Run with: npm run og
// Outputs into ./public. Re-run whenever the brand mark changes.

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { badgeSvg, markFull, markSimple, BRAND_ORANGE } from '../src/data/brandmark.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const ACCENT = '#E67423';

// The badge lockup, from docs/brand/sentinely-icon.svg. Small sizes get the
// simple variant: inside the badge the mark is ~73% of the tile, so a 32px
// favicon draws it at ~23px and a 16px tab icon at ~12px, well under the
// threshold where the eyes and the pulse line silt up.
const appIconSvg = badgeSvg({ variant: markFull });
const smallIconSvg = badgeSvg({ variant: markSimple });

// The mark on transparent, for the OG lockup: hard orange (no theme to inherit
// out there), twice the wordmark's cap height and centred on it — the same
// lockup as the header, which sets 1.45em against a 0.725em cap. Centred, not
// on the baseline: at twice the cap the mark is taller than the line of text,
// and standing it on the baseline would hang the whole thing above the word.
const OG_WORDMARK = 76;
const OG_BASELINE = 188;
const OG_MARK_X = 98;
/** Cap height of Arial/Helvetica (1467/2048), the stack the card is drawn in. */
const OG_CAP = OG_WORDMARK * 0.71631;
const OG_MARK_H = OG_CAP * 2;
/** The header's 0.55rem gap against its 1.12rem type, in these proportions. */
const OG_GAP = OG_WORDMARK * 0.491;
const OG_TEXT_X = +(OG_MARK_X + OG_MARK_H * markFull.ratio + OG_GAP).toFixed(1);

function ogMark({ height, x, capCentre, variant = markFull }) {
  const [vx, vy, , vh] = variant.viewBox.split(' ').map(Number);
  const scale = height / vh;
  const top = capCentre - height / 2;
  return (
    `<g transform="translate(${(x - vx * scale).toFixed(3)} ${(top - vy * scale).toFixed(3)}) scale(${scale.toFixed(6)})">` +
    `<path fill="${BRAND_ORANGE}" fill-rule="evenodd" clip-rule="evenodd" d="${variant.d}"/></g>`
  );
}

// Open Graph 1200x630.
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="82%" cy="12%" r="60%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.28"/>
      <stop offset="60%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#131009"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="6" fill="${ACCENT}"/>
  ${ogMark({ height: OG_MARK_H, x: OG_MARK_X, capCentre: OG_BASELINE - OG_CAP / 2 })}
  <text x="${OG_TEXT_X}" y="${OG_BASELINE}" font-family="Arial, Helvetica, sans-serif" font-size="${OG_WORDMARK}" font-weight="bold" fill="#FBF6EE" letter-spacing="-1.5">Sentinely</text>
  <text x="98" y="300" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="bold" fill="#ECE5DA">See every source sending as your domain.</text>
  <text x="98" y="372" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#A79B8B">DMARC reports, turned into a clear verdict — plus the controls to act.</text>
  <g font-family="'Courier New', monospace" font-size="24" fill="${ACCENT}">
    <text x="98" y="486">SPF</text>
    <text x="184" y="486">DKIM</text>
    <text x="288" y="486">DMARC</text>
    <text x="420" y="486">BIMI</text>
    <text x="512" y="486">MTA-STS</text>
    <text x="648" y="486">TLS-RPT</text>
  </g>
  <text x="98" y="566" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#6F6557">A product of Purple IT s.r.l.  ·  sentinely.eu</text>
</svg>`;

async function png(svg, size, out) {
  // density: rasterise the 512-unit artwork well above the target, then scale
  // down — otherwise the thin strokes alias badly at icon sizes.
  await sharp(Buffer.from(svg), { density: 900 })
    .resize(size, size)
    .png()
    .toFile(join(publicDir, out));
  console.log('✓', out);
}

await writeFile(join(publicDir, 'favicon.svg'), `${smallIconSvg}\n`);
console.log('✓ favicon.svg');

await png(smallIconSvg, 32, 'favicon-32.png');
await png(appIconSvg, 180, 'apple-touch-icon.png');
await png(appIconSvg, 192, 'icon-192.png');
await png(appIconSvg, 512, 'icon-512.png');

await sharp(Buffer.from(ogSvg)).png().toFile(join(publicDir, 'og.png'));
console.log('✓ og.png (1200x630)');
