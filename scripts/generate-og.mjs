// Generates raster assets (favicons, app icons, OG image) from SVG using sharp.
// Run with: npm run og
// Outputs into ./public. Re-run whenever the brand mark changes.

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const ACCENT = '#E67423';
const BTN_FG = '#241206';
const TILE_BG = '#17120B';

// Shield-check mark in a 32-unit box (matches public/favicon.svg).
const shield = (fill, stroke) => `
  <path d="M16 2.5 5.5 6.6v7.9C5.5 21.6 10 26.8 16 29.5c6-2.7 10.5-7.9 10.5-15V6.6L16 2.5Z" fill="${fill}"/>
  <path d="m10.8 15.6 3.5 3.5L21.2 12" fill="none" stroke="${stroke}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${shield(ACCENT, BTN_FG)}</svg>`;

// App tile: rounded dark background + centered orange shield.
const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${TILE_BG}"/>
  <g transform="translate(96,96) scale(10)">${shield(ACCENT, TILE_BG)}</g>
</svg>`;

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
  <g transform="translate(96,120) scale(2.6)">${shield(ACCENT, BTN_FG)}</g>
  <text x="188" y="188" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="bold" fill="#FBF6EE" letter-spacing="-1.5">Sentinely</text>
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

async function png(svg, size, out, resize = true) {
  let img = sharp(Buffer.from(svg));
  if (resize) img = img.resize(size, size);
  await img.png().toFile(join(publicDir, out));
  console.log('✓', out);
}

await png(faviconSvg, 32, 'favicon-32.png');
await png(appIconSvg, 180, 'apple-touch-icon.png');
await png(appIconSvg, 192, 'icon-192.png');
await png(appIconSvg, 512, 'icon-512.png');

await sharp(Buffer.from(ogSvg)).png().toFile(join(publicDir, 'og.png'));
console.log('✓ og.png (1200x630)');
