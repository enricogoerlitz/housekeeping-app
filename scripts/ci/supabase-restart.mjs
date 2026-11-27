// Restart of the preview project after its reset (preview logs of 27.11.2026). The pg_cron
// launcher keeps the job list it loaded when it started, across `supabase db reset`: on the
// preview it still ran jobs deleted long ago (purge_recipe_deletions, run_notification_tick),
// failing every run, and none of the current ones. A restart of the project starts it fresh.
//
//   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/ci/supabase-restart.mjs
//
// Management API: POST /v1/projects/{ref}/restart, then GET /v1/projects/{ref} until the status is
// ACTIVE_HEALTHY again (at most 10 min, else red), then the jobs in cron.job (red without any).
// No dependencies: runs in a job with the environment `preview`. Prints statuses and job names
// only, never the token or an answer body.
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = /^[a-z]{20}$/;
const STATUS = /^[A-Z_]+$/;
/** Only the tests point it elsewhere. */
const API = process.env.SUPABASE_STATUS_API_URL || 'https://api.supabase.com';
const TIMEOUT_MS = 10 * 60_000;
const POLL_MS = 10_000;
// Right after the POST the status may still read ACTIVE_HEALTHY; without having seen the restart
// the run goes on only after this long.
const SETTLE_MS = 60_000;
const QUERY_ATTEMPTS = 5;
const JOBS_QUERY = 'select jobname from cron.job order by jobid';

function statusOf({ status, text }) {
  if (status !== 200) return undefined;
  try {
    const value = JSON.parse(text)?.status;
    return typeof value === 'string' && STATUS.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function jobNames(text) {
  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) return undefined;
    return rows.map((row) => String(row?.jobname ?? '?'));
  } catch {
    return undefined;
  }
}

/**
 * `{ ok, message }`. `request(method, path, body?)` answers `{ status, text }`; `sleep` and `now`
 * are injected so the tests run without waiting.
 */
export async function restartProject({
  ref,
  request,
  sleep = delay,
  now = Date.now,
  timeoutMs = TIMEOUT_MS,
  pollMs = POLL_MS,
  settleMs = SETTLE_MS,
}) {
  const restart = await request('POST', `/v1/projects/${ref}/restart`);
  if (restart.status < 200 || restart.status > 299) {
    return {
      ok: false,
      message: `Neustart des Vorschau-Projekts abgelehnt (HTTP ${restart.status})`,
    };
  }
  const start = now();
  let restarted = false;
  let last = 'unbekannt';
  for (;;) {
    await sleep(pollMs);
    const status = statusOf(await request('GET', `/v1/projects/${ref}`));
    if (status) last = status;
    if (status && status !== 'ACTIVE_HEALTHY') restarted = true;
    if (status === 'ACTIVE_HEALTHY' && (restarted || now() - start >= settleMs)) break;
    if (now() - start >= timeoutMs) {
      return {
        ok: false,
        message: `Vorschau-Projekt nach ${Math.round(timeoutMs / 60_000)} min nicht bereit (Status ${last})`,
      };
    }
  }
  let answer;
  for (let attempt = 1; attempt <= QUERY_ATTEMPTS; attempt += 1) {
    answer = await request('POST', `/v1/projects/${ref}/database/query`, {
      query: JOBS_QUERY,
      read_only: true,
    });
    if (answer.status >= 200 && answer.status <= 299) break;
    if (attempt < QUERY_ATTEMPTS) await sleep(pollMs);
  }
  if (answer.status < 200 || answer.status > 299) {
    return { ok: false, message: `Cron-Jobs nicht abfragbar (HTTP ${answer.status})` };
  }
  const names = jobNames(answer.text);
  if (!names) return { ok: false, message: 'Cron-Jobs: Antwort ohne Zeilen' };
  if (names.length === 0) {
    return {
      ok: false,
      message: 'Vorschau-Projekt neu gestartet, aber keine Cron-Jobs in cron.job',
    };
  }
  return {
    ok: true,
    message: `Vorschau-Projekt neu gestartet und bereit; ${names.length} Cron-Jobs: ${names.join(', ')}`,
  };
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PROJECT_REF?.trim() ?? '';
  let decision;
  if (!token || !PROJECT_REF.test(ref)) {
    decision = { ok: false, message: 'SUPABASE_ACCESS_TOKEN oder SUPABASE_PROJECT_REF fehlt' };
  } else {
    const request = async (method, url, body) => {
      try {
        const response = await fetch(`${API}${url}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(30_000),
        });
        return { status: response.status, text: await response.text() };
      } catch {
        // A network gap counts like an answer without status; the caller waits or gives up.
        return { status: 0, text: '' };
      }
    };
    const number = (name) => {
      const value = Number(process.env[name]);
      return Number.isFinite(value) && process.env[name] !== undefined ? value : undefined;
    };
    decision = await restartProject({
      ref,
      request,
      // Only the tests set these.
      pollMs: number('SUPABASE_RESTART_POLL_MS'),
      settleMs: number('SUPABASE_RESTART_SETTLE_MS'),
    });
  }
  if (decision.ok) {
    console.log(decision.message);
    return 0;
  }
  // Workflow commands (::error::) are read from stdout.
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error::${decision.message}`);
  else console.error(`FEHLER: ${decision.message}`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
