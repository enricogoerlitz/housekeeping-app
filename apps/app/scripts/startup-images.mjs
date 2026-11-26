// Spec 0044, REQ-001: the iPhone shows a start image while a home-screen web app loads; without
// one it is white. iOS ignores the manifest's background_color and only takes an image of exactly
// the screen's pixel size (`apple-touch-startup-image`, decision 7). One plain image in the app's
// background colour per iPhone size, portrait, light and dark; index.html links them.
//
// Usage: node scripts/startup-images.mjs  (writes public/splash/, prints the <link> tags)
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

/** iPhone screens in CSS pixels and their pixel ratio (iOS 17 and later). */
const IPHONE_SCREENS = [
  { width: 375, height: 667, ratio: 2 }, // SE 2nd/3rd generation
  { width: 414, height: 736, ratio: 3 }, // 8 Plus
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14, 16e
  { width: 428, height: 926, ratio: 3 }, // 12/13 Pro Max, 14 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
];

/** The `bg` of the default theme (Markthalle), as in index.html and theme-boot.js. */
const STARTUP_COLORS = { light: '#FAF6EE', dark: '#1B1613' };

export function startupImages() {
  return IPHONE_SCREENS.flatMap((screen) =>
    Object.entries(STARTUP_COLORS).map(([mode, color]) => {
      const pixels = { width: screen.width * screen.ratio, height: screen.height * screen.ratio };
      return {
        ...pixels,
        mode,
        color,
        href: `/splash/${mode}-${pixels.width}x${pixels.height}.png`,
        media:
          `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and ` +
          `(-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait) and ` +
          `(prefers-color-scheme: ${mode})`,
      };
    }),
  );
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A PNG of one colour (8-bit RGB). */
function plainPng(width, height, color) {
  const rgb = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16));
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set(rgb, 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
  mkdirSync(path.join(publicDir, 'splash'), { recursive: true });
  for (const image of startupImages()) {
    writeFileSync(
      path.join(publicDir, image.href),
      plainPng(image.width, image.height, image.color),
    );
    console.log(
      `    <link rel="apple-touch-startup-image" href="${image.href}" media="${image.media}" />`,
    );
  }
}
