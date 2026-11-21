// Global setup of the walk-through against the local backend (spec 0003, AC-033/AC-034):
// 1. `pnpm db:reset`: migrations, test accounts and the demo households, dated from today.
// 2. The production web export (`build:web`: CSP and service worker) with the developer switch,
//    the local Supabase values and the app version 2026.12.4 (spec 0014). EXPO_PUBLIC_* values are baked in at export time, so the
//    export is rebuilt whenever they, the app sources or the export itself changed.
// 3. A static server on 127.0.0.1:8790 — the only e2e origin the edge functions' CORS and the
//    Supabase redirect URLs allow.
//
// Environment values come from `.env` (loaded into this process only, never printed) or, in CI,
// from the job environment. E2E_SKIP_RESET=1 skips the reset; E2E_REBUILD=1 forces the export.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_PORT = 8790;
/** The version the e2e export is built as (spec 0014). */
export const E2E_APP_VERSION = '2026.12.4';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const dist = path.join(repo, 'apps/app/dist');
const markerFile = path.join(repo, 'tmp/e2e/build-marker.json');

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: repo, stdio: 'inherit', env });
  if (result.status !== 0) throw new Error(`e2e setup: ${command} ${args.join(' ')} failed`);
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : '';
}

/** Everything the export depends on: the public values and the state of the sources. */
function buildInputs(env: NodeJS.ProcessEnv): string {
  const sources = ['apps/app', 'packages', 'pnpm-lock.yaml'];
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...sources])
    .split('\n')
    .filter(Boolean)
    .map((file) => `${file}:${sha256(readFileSync(path.join(repo, file)))}`)
    .join('\n');
  return sha256(
    [
      env.EXPO_PUBLIC_SUPABASE_URL,
      env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      env.EXPO_PUBLIC_DEV_LOGIN,
      env.EXPO_PUBLIC_VAPID_PUBLIC_KEY,
      env.EXPO_PUBLIC_APP_VERSION,
      git(['rev-parse', 'HEAD']),
      git(['diff', 'HEAD', '--', ...sources]),
      untracked,
    ].join('\0'),
  );
}

function indexHash(): string | undefined {
  const index = path.join(dist, 'index.html');
  return existsSync(index) ? sha256(readFileSync(index)) : undefined;
}

function buildIfStale(env: NodeJS.ProcessEnv): void {
  const inputs = buildInputs(env);
  let marker: { inputs?: string; index?: string } = {};
  try {
    marker = JSON.parse(readFileSync(markerFile, 'utf8')) as typeof marker;
  } catch {
    // No marker yet: build.
  }
  const current = indexHash();
  if (!process.env.E2E_REBUILD && current && marker.inputs === inputs && marker.index === current) {
    console.log('e2e setup: web export is up to date.');
    return;
  }
  console.log('e2e setup: exporting the web build with the developer switch …');
  run('pnpm', ['--filter', '@housekeeping/app', 'build:web'], env);
  mkdirSync(path.dirname(markerFile), { recursive: true });
  writeFileSync(markerFile, JSON.stringify({ inputs, index: indexHash() }));
}

async function serverResponds(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${E2E_PORT}/`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer(): Promise<ChildProcess | undefined> {
  if (await serverResponds()) {
    // A server from an earlier run (e.g. `node serve.mjs`): it serves apps/app/dist from disk.
    console.log(`e2e setup: reusing the server on port ${E2E_PORT}.`);
    return undefined;
  }
  const server = spawn(process.execPath, [path.join(here, 'serve.mjs'), dist, String(E2E_PORT)], {
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await serverResponds()) return server;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill();
  throw new Error(`e2e setup: the static server did not start on port ${E2E_PORT}`);
}

/** Loads the root .env into this process (values never printed) and checks the public values. */
export function loadEnv(): void {
  const envFile = path.join(repo, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
    if (!process.env[name]?.trim()) throw new Error(`e2e setup: ${name} is not set`);
  }
  const host = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('e2e setup: EXPO_PUBLIC_SUPABASE_URL must point at the local Supabase');
  }
}

/** `pnpm db:reset` unless E2E_SKIP_RESET is set. */
export function resetDatabase(): void {
  if (!process.env.E2E_SKIP_RESET) run('pnpm', ['db:reset']);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  loadEnv();
  resetDatabase();
  // A release version, so the version check runs as in production (rundgang-version.spec.ts).
  buildIfStale({
    ...process.env,
    EXPO_PUBLIC_DEV_LOGIN: '1',
    EXPO_PUBLIC_APP_VERSION: E2E_APP_VERSION,
  });
  const server = await startServer();
  return async () => {
    server?.kill();
  };
}
