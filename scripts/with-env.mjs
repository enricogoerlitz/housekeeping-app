// Runs a command with the root .env loaded into its environment (never printed).
// Expo only reads .env files from apps/app; the project keeps one .env at the root.
// Only EXPO_PUBLIC_* values end up in the app bundle; everything else stays in the process.
// Usage: node scripts/with-env.mjs <command> [args...]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
else console.warn('No .env at the repository root – copy .env.example to .env first.');

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/with-env.mjs <command> [args...]');
  process.exit(2);
}
const child = spawn(command, args, { stdio: 'inherit', env: process.env, cwd: root });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
