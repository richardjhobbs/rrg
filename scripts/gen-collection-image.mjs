/**
 * Generate RRG collection image (500x500 PNG)
 * Minimal brand-consistent design: dark background, "RRG" text
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WIDTH = 500;
const HEIGHT = 500;

// Create SVG with the RRG branding
const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="100%" style="stop-color:#1a1a1a"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <text x="250" y="220" text-anchor="middle" font-family="Georgia, serif" font-size="120" font-weight="700" fill="#efefef" letter-spacing="8">RRG</text>
  <line x1="120" y1="260" x2="380" y2="260" stroke="#ffffff" stroke-width="1" opacity="0.3"/>
  <text x="250" y="310" text-anchor="middle" font-family="'Courier New', monospace" font-size="16" fill="#999999" letter-spacing="6">REAL REAL GENUINE</text>
  <text x="250" y="370" text-anchor="middle" font-family="'Courier New', monospace" font-size="11" fill="#666666" letter-spacing="3">LIMITED EDITIONS ON BASE</text>
</svg>`;

const outputPath = join(__dirname, '..', 'rrg-collection.png');

await sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath);

console.log(`✅ Collection image saved to: ${outputPath}`);
