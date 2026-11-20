// Copies the AI contract from core into the edge functions (Deno cannot import workspace
// packages). `--check` only compares and exits non-zero when the copy is out of date.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'packages/core/src/ai-contract.ts');
const target = resolve(root, 'supabase/functions/_shared/contract.gen.ts');
const header =
  '// Generated from packages/core/src/ai-contract.ts by `pnpm gen:edge` — do not edit.\n';

const contract = await readFile(source, 'utf8');
const imports = [...contract.matchAll(/^\s*import[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
  (m) => m[1],
);
const foreign = imports.filter((name) => name !== 'zod');
if (foreign.length > 0) {
  console.error(`ai-contract.ts may import only zod, found: ${foreign.join(', ')}`);
  process.exit(1);
}
const expected = header + contract;
const relativeTarget = 'supabase/functions/_shared/contract.gen.ts';

if (process.argv.includes('--check')) {
  const actual = await readFile(target, 'utf8').catch(() => undefined);
  if (actual !== expected) {
    console.error(`${relativeTarget} is out of date. Run \`pnpm gen:edge\`.`);
    process.exit(1);
  }
} else {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, expected);
  console.log(`Wrote ${relativeTarget}`);
}
