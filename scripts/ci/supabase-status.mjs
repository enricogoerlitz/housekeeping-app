// Status of the preview project before a preview run (spec 0014, Task 7; AC-017). Supabase Free
// pauses a project after a week without activity; then the run stops here, red, before anything
// is reset or delivered, and the preview keeps showing the previous state.
//
//   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/ci/supabase-status.mjs
//
// Asks the Management API (GET /v1/projects/{ref}, token right projects_read). No dependencies: runs
// in a job with the environment `preview`. Prints the status only, never the token or the answer.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAUSED_MESSAGE =
  'Keine Vorschau: Vorschau-Projekt pausiert – im Supabase-Dashboard fortsetzen';
const PAUSED = new Set(['INACTIVE', 'PAUSED', 'PAUSING']);
const PROJECT_REF = /^[a-z]{20}$/;
/** Only the tests point it elsewhere. */
const API = process.env.SUPABASE_STATUS_API_URL || 'https://api.supabase.com';

/** `{ ok, message }` from the answer of GET /v1/projects/{ref}. */
export function projectStatusDecision({ httpStatus, body }) {
  if (httpStatus !== 200) {
    return { ok: false, message: `Vorschau-Projekt nicht abrufbar (HTTP ${httpStatus})` };
  }
  let status;
  try {
    status = JSON.parse(body)?.status;
  } catch {
    status = undefined;
  }
  if (typeof status !== 'string' || !/^[A-Z_]+$/.test(status)) {
    return { ok: false, message: 'Vorschau-Projekt: Antwort ohne Status' };
  }
  if (status === 'ACTIVE_HEALTHY') return { ok: true, message: 'Vorschau-Projekt bereit' };
  if (PAUSED.has(status)) return { ok: false, message: PAUSED_MESSAGE };
  return {
    ok: false,
    message: `Keine Vorschau: Vorschau-Projekt ist nicht bereit (Status ${status}) – Lauf später erneut starten`,
  };
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PROJECT_REF?.trim() ?? '';
  let decision;
  if (!token || !PROJECT_REF.test(ref)) {
    decision = { ok: false, message: 'SUPABASE_ACCESS_TOKEN oder SUPABASE_PROJECT_REF fehlt' };
  } else {
    try {
      const response = await fetch(`${API}/v1/projects/${ref}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      decision = projectStatusDecision({
        httpStatus: response.status,
        body: await response.text(),
      });
    } catch (error) {
      decision = {
        ok: false,
        message: `Vorschau-Projekt nicht abrufbar (${error?.cause?.code ?? error?.name ?? 'Fehler'})`,
      };
    }
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
