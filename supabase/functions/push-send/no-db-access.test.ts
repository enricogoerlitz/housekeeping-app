/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// AC-046: push-send only delivers. It has no database access, no Supabase client and no
// service-role key; it reads exactly four environment variables, and only in index.ts.

const here = dirname(fileURLToPath(import.meta.url));
const functionsDir = resolve(here, '..');

/** push-send's own source files and every file they import, relatively and transitively. */
function sourceGraph(entries: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    seen.set(file, source);
    for (const match of source.matchAll(/(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      queue.push(resolve(dirname(file), match[1] as string));
    }
  }
  return seen;
}

const entries = readdirSync(here)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => join(here, name));
const graph = sourceGraph(entries);
const name = (file: string) => relative(functionsDir, file);

describe('push-send has no database access (AC-046)', () => {
  it('covers index, handler and web-push', () => {
    expect(entries.map(name).sort()).toEqual([
      'push-send/handler.ts',
      'push-send/index.ts',
      'push-send/web-push.ts',
    ]);
  });

  it.each([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_URL',
    'SUPABASE_URL',
    'supabase-js',
    'createClient',
    'createUserClient',
    'service_role',
  ])('AC-046: no source of push-send or its imports mentions %s', (forbidden) => {
    for (const [file, source] of graph) {
      expect(source.includes(forbidden), `${name(file)} mentions ${forbidden}`).toBe(false);
    }
  });

  it('AC-046: Deno.env is read only in index.ts, and only the four allowed names', () => {
    for (const [file, source] of graph) {
      if (name(file) !== 'push-send/index.ts') expect(source, name(file)).not.toContain('Deno.env');
    }
    const index = graph.get(join(here, 'index.ts')) ?? '';
    const names = [...index.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]).sort();
    expect(names).toEqual([
      'PUSH_SEND_SECRET',
      'VAPID_PRIVATE_KEY',
      'VAPID_PUBLIC_KEY',
      'VAPID_SUBJECT',
    ]);
  });
});

describe('the web push library stays inside push-send', () => {
  function allSources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (entry === 'node_modules') return [];
      if (statSync(path).isDirectory()) return allSources(path);
      return entry.endsWith('.ts') ? [path] : [];
    });
  }

  it('only push-send imports @negrel/webpush', () => {
    const users = allSources(functionsDir)
      .filter((file) => readFileSync(file, 'utf8').includes('@negrel/webpush'))
      .map(name)
      .filter((file) => !file.startsWith('push-send/'));
    expect(users).toEqual([]);
  });
});
