// scripts/ci/supabase-status.mjs (spec 0014, Task 7; AC-017): the preview run stops with a clear
// message when the preview project is paused, before anything is reset or delivered.
//
//   node --test scripts/ci/supabase-status.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PAUSED_MESSAGE, projectStatusDecision } from './supabase-status.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'supabase-status.mjs');

describe('AC-017: status of the preview project', () => {
  test('ACTIVE_HEALTHY: go on', () => {
    const decision = projectStatusDecision({
      httpStatus: 200,
      body: JSON.stringify({ status: 'ACTIVE_HEALTHY', name: 'housekeeping-vorschau' }),
    });
    assert.equal(decision.ok, true);
  });

  test('INACTIVE or PAUSED: red with the message of the spec', () => {
    for (const status of ['INACTIVE', 'PAUSED', 'PAUSING']) {
      const decision = projectStatusDecision({ httpStatus: 200, body: JSON.stringify({ status }) });
      assert.equal(decision.ok, false, status);
      assert.equal(decision.message, PAUSED_MESSAGE);
    }
    assert.equal(
      PAUSED_MESSAGE,
      'Keine Vorschau: Vorschau-Projekt pausiert – im Supabase-Dashboard fortsetzen',
    );
  });

  test('any other status (coming up, restoring, unhealthy): red with the status, not a guess', () => {
    for (const status of ['COMING_UP', 'RESTORING', 'ACTIVE_UNHEALTHY', 'UNKNOWN']) {
      const decision = projectStatusDecision({ httpStatus: 200, body: JSON.stringify({ status }) });
      assert.equal(decision.ok, false);
      assert.match(decision.message, new RegExp(status));
    }
  });

  test('an answer that is not 200 or not JSON: red with the HTTP status, nothing of the body', () => {
    const denied = projectStatusDecision({ httpStatus: 401, body: '{"message":"secret detail"}' });
    assert.equal(denied.ok, false);
    assert.match(denied.message, /HTTP 401/);
    assert.ok(!denied.message.includes('secret detail'));
    assert.equal(projectStatusDecision({ httpStatus: 200, body: '<html>' }).ok, false);
    assert.equal(projectStatusDecision({ httpStatus: 200, body: '{}' }).ok, false);
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

  // Asynchronous: a synchronous spawn would block the event loop the test server needs.
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

  test('asks /v1/projects/{ref} with the token and passes on a healthy project', async () => {
    let seen;
    const result = await withApi(
      (req, res) => {
        seen = { url: req.url, auth: req.headers.authorization };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ status: 'ACTIVE_HEALTHY' }));
      },
      (base) =>
        runCli({
          SUPABASE_STATUS_API_URL: base,
          SUPABASE_ACCESS_TOKEN: 'sbp_test_token_value',
          SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        }),
    );
    assert.equal(result.status, 0, result.output);
    assert.equal(seen.url, '/v1/projects/abcdefghijklmnopqrst');
    assert.equal(seen.auth, 'Bearer sbp_test_token_value');
    assert.ok(!result.output.includes('sbp_test_token_value'));
  });

  test('AC-017: a paused project ends the run red with the message', async () => {
    const result = await withApi(
      (_req, res) => res.end(JSON.stringify({ status: 'INACTIVE' })),
      (base) =>
        runCli({
          SUPABASE_STATUS_API_URL: base,
          SUPABASE_ACCESS_TOKEN: 'sbp_x',
          SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
          GITHUB_ACTIONS: 'true',
        }),
    );
    assert.equal(result.status, 1);
    assert.match(result.output, new RegExp(`::error::${PAUSED_MESSAGE}`));
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
        }),
    );
    assert.equal(result.status, 1);
    assert.equal(asked, false);
  });
});
