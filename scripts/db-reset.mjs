// Resets the LOCAL database: migrations + supabase/seed.sql (test accounts and demo households).
// When DEV_OWNER_EMAIL is set (in .env or the environment), that address gets an open invitation
// to both seed households; a real Google account can sign up with it and accept them.
// Values are handed to psql through the container's environment (\getenv), never as an argument
// or a file, and never printed.
//
//   pnpm db:reset
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(root, '.env');
// Values go only into this process (and its children), never to the output.
if (existsSync(envFile)) process.loadEnvFile(envFile);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`${command} ${args[0] ?? ''} failed`);
    process.exit(result.status ?? 1);
  }
  return result;
}

run(resolve(root, 'node_modules/.bin/supabase'), ['db', 'reset']);

function localProjectId() {
  const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) {
    console.error('project_id missing in supabase/config.toml');
    process.exit(1);
  }
  return projectId;
}

/** Runs SQL as postgres in the local database container, passing only the named variables. */
function psql(sql, envNames) {
  return spawnSync(
    'docker',
    [
      'exec',
      '-i',
      ...envNames.flatMap((name) => ['-e', name]),
      `supabase_db_${localProjectId()}`,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
    ],
    { cwd: root, input: sql, stdio: ['pipe', 'ignore', 'pipe'], env: process.env },
  );
}

if (process.env.DEV_OWNER_EMAIL?.trim()) {
  // Both seed households; inviting twice is harmless.
  const sql = `
\\getenv email DEV_OWNER_EMAIL
insert into public.household_invitations (household_id, email)
select h.id, lower(btrim(:'email')) from public.households h
where h.name in ('Enrico & Nadja', 'Test')
on conflict (household_id, email) do nothing;
`;
  const invite = psql(sql, ['DEV_OWNER_EMAIL']);
  if (invite.status !== 0) {
    // psql echoes the failing statement, which would contain the address: not shown.
    console.error(
      'Inviting DEV_OWNER_EMAIL failed (psql output hidden): not a valid address, or the stack is not running.',
    );
    process.exit(invite.status ?? 1);
  }
  console.log('Invited DEV_OWNER_EMAIL to "Enrico & Nadja" and "Test".');
} else {
  console.log('DEV_OWNER_EMAIL is not set: no owner invitation.');
}
