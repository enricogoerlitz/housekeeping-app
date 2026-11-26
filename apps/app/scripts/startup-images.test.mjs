// Spec 0044, AC-001: index.html links a start image for every iPhone size, light and dark, and
// each image has exactly the pixel size of its query and the app's background colour.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { startupImages } from './startup-images.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(path.join(appDir, 'public/index.html'), 'utf8');

/** Width, height and the colour of the first and the last pixel of an 8-bit RGB PNG. */
function readPng(file) {
  const data = readFileSync(file);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const idat = [];
  for (let at = 8; at < data.length;) {
    const length = data.readUInt32BE(at);
    const type = data.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(data.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const hex = (offset) =>
    `#${[0, 1, 2].map((i) => raw[offset + i].toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  return { width, height, first: hex(1), last: hex(raw.length - 3) };
}

test('AC-001: index.html links a start image per iPhone size, light and dark', () => {
  const links = [
    ...index.matchAll(
      /<link\s+rel="apple-touch-startup-image"\s+href="([^"]+)"\s+media="([^"]+)"\s*\/>/g,
    ),
  ];
  const expected = startupImages();
  assert.equal(links.length, expected.length);
  for (const image of expected) {
    assert.ok(
      links.some(([, href, media]) => href === image.href && media === image.media),
      `index.html links ${image.href} for ${image.media}`,
    );
  }
  assert.equal(new Set(expected.map((image) => image.media)).size, expected.length);
});

for (const image of startupImages()) {
  test(`AC-001: ${image.href} is ${image.width} × ${image.height} in ${image.color}`, () => {
    const file = path.join(appDir, 'public', image.href);
    assert.ok(existsSync(file), `${image.href} exists`);
    const png = readPng(file);
    assert.equal(png.width, image.width);
    assert.equal(png.height, image.height);
    assert.equal(png.first, image.color);
    assert.equal(png.last, image.color);
  });
}
