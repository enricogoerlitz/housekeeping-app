// scripts/ci/supabase-restart.mjs (preview run, finding of 27.11.2026): after the reset the
// preview project is restarted, so the pg_cron launcher loads the current jobs, and the run waits
// until the project is healthy again.
//
//   node --test scripts/ci/supabase-restart.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { restartProject } from './supabase-restart.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'supabase-restart.mjs');
const REF = 'abcdefghijklmnopqrst';
const JOBS = [{ jobname: 'purge-deletions' }, { jobname: 'add-due-recurring-items' }];

/** A fake Management API: statuses in order, then the last one forever; a clock that sleeps. */
function fakeApi({ restart = 200, statuses, query = () => ({ status: 201, body: JOBS }) }) {
  const calls = [];
  let polls = 0;
  let clock = 0;
  const request = async (method, url, body) => {
    calls.push({ method, url, body });
    if (method === 'POST' && url === `/v1/projects/${REF}/restart`) {
      return { status: restart, text: '{}' };
    }
    if (method === 'GET' && url === `/v1/projects/${REF}`) {
      const status = statuses[Math.min(polls, statuses.length - 1)];
      polls += 1;
      return typeof status === 'number'
        ? { status, text: '' }
        : { status: 200, text: JSON.stringify({ status }) };
    }
    if (method === 'POST' && url === `/v1/projects/${REF}/database/query`) {
      const answer = query(body);
      return { status: answer.status, text: JSON.stringify(answer.body) };
    }
    return { status: 404, text: '' };
  };
  return {
    calls,
    options: {
      ref: REF,
      request,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      pollMs: 10_000,
      timeoutMs: 600_000,
      settleMs: 60_000,
    },
    elapsed: () => clock,
  };
}

describe('restart of the preview project', () => {
  test('restarts, waits through the restart until ACTIVE_HEALTHY and lists the cron jobs', async () => {
    const api = fakeApi({
      statuses: ['ACTIVE_HEALTHY', 'RESTARTING', 'COMING_UP', 'ACTIVE_HEALTHY'],
    });
    const result = await restartProject(api.options);
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(
      [api.calls[0].method, api.calls[0].url],
      ['POST', `/v1/projects/${REF}/restart`],
    );
    const query = api.calls.at(-1);
    assert.equal(query.url, `/v1/projects/${REF}/database/query`);
    assert.match(query.body.query, /from cron\.job/);
    assert.equal(query.body.read_only, true);
    assert.match(result.message, /2 Cron-Jobs: purge-deletions, add-due-recurring-items/);
  });

  test('a project that stays ACTIVE_HEALTHY counts as restarted only after the settle time', async () => {
    const api = fakeApi({ statuses: ['ACTIVE_HEALTHY'] });
    const result = await restartProject(api.options);
    assert.equal(result.ok, true, result.message);
    assert.ok(api.elapsed() >= 60_000, `went on after ${api.elapsed()} ms`);
  });

  test('a project that does not come back within 10 min ends the run red with its status', async () => {
    const api = fakeApi({ statuses: ['RESTARTING', 'COMING_UP'] });
    const result = await restartProject(api.options);
    assert.equal(result.ok, false);
    assert.match(result.message, /nach 10 min nicht bereit \(Status COMING_UP\)/);
    assert.ok(api.elapsed() <= 600_000 + 10_000);
    assert.ok(!api.calls.some((call) => call.url.endsWith('/database/query')));
  });

  test('a short gap of the status API during the restart is waited out', async () => {
    const api = fakeApi({ statuses: ['RESTARTING', 503, 'ACTIVE_HEALTHY'] });
    assert.equal((await restartProject(api.options)).ok, true);
  });

  test('a refused restart stops at once with the HTTP status, nothing of the body', async () => {
    const api = fakeApi({ restart: 403, statuses: ['ACTIVE_HEALTHY'] });
    const result = await restartProject(api.options);
    assert.equal(result.ok, false);
    assert.match(result.message, /HTTP 403/);
    assert.equal(api.calls.length, 1);
  });

  test('no cron job after the restart, or a query that keeps failing, is red', async () => {
    const empty = fakeApi({
      statuses: ['RESTARTING', 'ACTIVE_HEALTHY'],
      query: () => ({ status: 201, body: [] }),
    });
    const none = await restartProject(empty.options);
    assert.equal(none.ok, false);
    assert.match(none.message, /keine Cron-Jobs/);
    const failing = fakeApi({
      statuses: ['RESTARTING', 'ACTIVE_HEALTHY'],
      query: () => ({ status: 400, body: { message: 'connection refused' } }),
    });
    const failed = await restartProject(failing.options);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /HTTP 400/);
    assert.ok(!failed.message.includes('connection refused'));
  });

  test('a query that fails right after the restart is asked again', async () => {
    let asked = 0;
    const api = fakeApi({
      statuses: ['RESTARTING', 'ACTIVE_HEALTHY'],
      query: () => {
        asked += 1;
        return asked === 1 ? { status: 503, body: {} } : { status: 201, body: JOBS };
      },
    });
    assert.equal((await restartProject(api.options)).ok, true);
    assert.equal(asked, 2);
  });
});

describe('CLI', () => {
  async function withApi(handler, run) {
    const server = createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      return await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
      server.close();
    }
  }

  const runCli = (env) =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [script],
        { env: { ...process.env, GITHUB_ACTIONS: '', ...env } },
        (error, stdout, stderr) =>
          resolve({ status: error ? error.code : 0, output: `${stdout}${stderr}` }),
      );
    });

  test('sends the token, prints the jobs, never the token', async () => {
    const seen = [];
    const result = await withApi(
      (req, res) => {
        seen.push(`${req.method} ${req.url} ${req.headers.authorization}`);
        res.setHeader('content-type', 'application/json');
        if (req.url.endsWith('/database/query')) res.end(JSON.stringify(JOBS));
        else res.end(JSON.stringify({ status: 'ACTIVE_HEALTHY' }));
      },
      (base) =>
        runCli({
          SUPABASE_STATUS_API_URL: base,
          SUPABASE_RESTART_SETTLE_MS: '0',
          SUPABASE_RESTART_POLL_MS: '1',
          SUPABASE_ACCESS_TOKEN: 'sbp_test_token_value',
          SUPABASE_PROJECT_REF: REF,
        }),
    );
    assert.equal(result.status, 0, result.output);
    assert.equal(seen[0], `POST /v1/projects/${REF}/restart Bearer sbp_test_token_value`);
    assert.match(result.output, /2 Cron-Jobs/);
    assert.ok(!result.output.includes('sbp_test_token_value'));
  });

  test('without token or with an invalid ref nothing is asked', async () => {
    let asked = false;
    const result = await withApi(
      (_req, res) => {
        asked = true;
        res.end('{}');
      },
      (base) =>
        runCli({
          SUPABASE_STATUS_API_URL: base,
          SUPABASE_ACCESS_TOKEN: '',
          SUPABASE_PROJECT_REF: 'x',
          GITHUB_ACTIONS: 'true',
        }),
    );
    assert.equal(result.status, 1);
    assert.match(result.output, /::error::/);
    assert.equal(asked, false);
  });
});
