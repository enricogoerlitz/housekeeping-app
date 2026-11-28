// Copies pure core modules into the edge functions (Deno cannot import workspace packages).
// `--check` only compares and exits non-zero when a copy is out of date.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  {
    source: 'packages/core/src/ai-contract.ts',
    target: 'supabase/functions/_shared/contract.gen.ts',
    allowedImports: ['zod'],
  },
  {
    source: 'packages/core/src/maps-link.ts',
    target: 'supabase/functions/_shared/maps-link.gen.ts',
    allowedImports: [],
  },
  {
    source: 'packages/core/src/image-source.ts',
    target: 'supabase/functions/_shared/image-source.gen.ts',
    allowedImports: [],
  },
  {
    source: 'packages/core/src/agent-proposals.ts',
    target: 'supabase/functions/_shared/agent-proposals.gen.ts',
    allowedImports: ['zod'],
  },
  {
    source: 'packages/core/src/ai-agent.ts',
    target: 'supabase/functions/_shared/ai-agent.gen.ts',
    allowedImports: ['zod'],
    // Spec 0067: the agent's contract uses two other copies; Deno imports them by their file.
    siblings: {
      './agent-proposals': './agent-proposals.gen.ts',
      './ai-contract': './contract.gen.ts',
    },
  },
  {
    source: 'packages/core/src/agent-tools.ts',
    target: 'supabase/functions/_shared/agent-tools.gen.ts',
    allowedImports: ['zod'],
  },
  {
    source: 'packages/core/src/web-results.ts',
    target: 'supabase/functions/_shared/web-results.gen.ts',
    allowedImports: [],
  },
];
const check = process.argv.includes('--check');
let failed = false;

for (const { source, target, allowedImports, siblings = {} } of copies) {
  let content = await readFile(resolve(root, source), 'utf8');
  const imports = [...content.matchAll(/^\s*import[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
    (m) => m[1],
  );
  const foreign = imports.filter((name) => !allowedImports.includes(name) && !(name in siblings));
  if (foreign.length > 0) {
    const allowed = allowedImports.length > 0 ? `only ${allowedImports.join(', ')}` : 'nothing';
    console.error(`${source} may import ${allowed}, found: ${foreign.join(', ')}`);
    failed = true;
    continue;
  }
  for (const [from, to] of Object.entries(siblings)) {
    content = content.replaceAll(`from '${from}';`, `from '${to}';`);
  }
  const expected = `// Generated from ${source} by \`pnpm gen:edge\` — do not edit.\n${content}`;
  const targetPath = resolve(root, target);
  if (check) {
    const actual = await readFile(targetPath, 'utf8').catch(() => undefined);
    if (actual !== expected) {
      console.error(`${target} is out of date. Run \`pnpm gen:edge\`.`);
      failed = true;
    }
  } else {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, expected);
    console.log(`Wrote ${target}`);
  }
}
if (failed) process.exit(1);
