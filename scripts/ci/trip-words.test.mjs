// Spec 0022, AC-041: "Reise" is the one term. No file under apps/, packages/, supabase/functions/,
// supabase/tests/ or the seeds contains the old words (case ignored).
//
//   node --test scripts/ci/trip-words.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOTS = ['apps', 'packages', 'supabase/functions', 'supabase/tests'];
const FILES = ['supabase/seed.sql', 'supabase/preview-seed.sql'];
const SKIP = new Set(['node_modules', '.expo', 'dist', '.turbo', 'coverage', 'ios', 'android']);
// Assembled, so this file does not find itself.
const OLD_WORDS = new RegExp(['ab' + 'sence', 'ab' + 'wesen', 'urlaubs' + 'seite'].join('|'), 'i');

function filesUnder(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full));
    else found.push(full);
  }
  return found;
}

test('AC-041: no old word for a trip in code, tests, functions and seeds', () => {
  const files = [
    ...ROOTS.flatMap((dir) => filesUnder(path.join(root, dir))),
    ...FILES.map((file) => path.join(root, file)),
  ];
  const hits = files.filter((file) => {
    if (/\.(png|jpg|jpeg|webp|gif|ico|ttf|otf|woff2?)$/i.test(file)) return false;
    return OLD_WORDS.test(readFileSync(file, 'utf8'));
  });
  assert.deepEqual(
    hits.map((file) => path.relative(root, file)),
    [],
  );
});
