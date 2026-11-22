// Spec 0019, AC-025: public/theme-boot.js paints the background of the stored theme before the app
// starts. Its colours must stay the `bg` of the themes in packages/ui.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const themesDir = path.resolve(appDir, '../../packages/ui/src/themes');
const boot = readFileSync(path.join(appDir, 'public/theme-boot.js'), 'utf8');
const index = readFileSync(path.join(appDir, 'public/index.html'), 'utf8');

function themeBg(id, mode) {
  const source = readFileSync(path.join(themesDir, `${id}.ts`), 'utf8');
  const match = source.match(
    new RegExp(`const ${mode}: ThemeColors = \\{\\s*bg: '(#[0-9A-Fa-f]{6})'`),
  );
  assert.ok(match, `${id} ${mode} has a bg`);
  return match[1].toUpperCase();
}

function bootBg(id, mode) {
  const match = boot.match(
    new RegExp(`${id}: \\{ light: '(#[0-9A-Fa-f]{6})', dark: '(#[0-9A-Fa-f]{6})' \\}`),
  );
  assert.ok(match, `theme-boot.js knows ${id}`);
  return (mode === 'light' ? match[1] : match[2]).toUpperCase();
}

for (const id of ['markthalle', 'klar', 'frisch']) {
  for (const mode of ['light', 'dark']) {
    test(`AC-025: theme-boot.js has the ${mode} background of ${id}`, () => {
      assert.equal(bootBg(id, mode), themeBg(id, mode));
    });
  }
}

test('AC-025: index.html paints the default theme before any script and loads theme-boot.js', () => {
  assert.ok(
    index
      .toLowerCase()
      .includes(`background-color: ${themeBg('markthalle', 'light').toLowerCase()}`),
  );
  assert.ok(
    index
      .toLowerCase()
      .includes(`background-color: ${themeBg('markthalle', 'dark').toLowerCase()}`),
  );
  assert.ok(index.includes('<script src="/theme-boot.js"></script>'));
});

test('AC-022: the page reaches the screen edges', () => {
  assert.ok(index.includes('viewport-fit=cover'));
});
