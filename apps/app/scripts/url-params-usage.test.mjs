// Spec 0019, AC-054: no page reads a route parameter past the list in core. Pages read and write
// the address only through `usePageParams` (src/lib/url-state.ts), whose page keys and names
// TypeScript checks against `PAGE_PARAMS`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const ALLOWED = new Set([path.join('lib', 'url-state.ts')]);
const READERS =
  /\b(useLocalSearchParams|useGlobalSearchParams|useSearchParams|router\.setParams)\b/;

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

test('AC-054: only src/lib/url-state.ts reads or sets route parameters', () => {
  const offenders = sources(srcDir)
    .map((file) => path.relative(srcDir, file))
    .filter((file) => !ALLOWED.has(file))
    .filter((file) => READERS.test(readFileSync(path.join(srcDir, file), 'utf8')));
  assert.deepEqual(offenders, []);
});
