// scripts/release/version.mjs (spec 0014, Task 6): next version from the tags, docs-only releases,
// the minimum version guard and the check before a web redeploy. Pure functions plus the CLI
// against throwaway git repositories under tmp/ and a local HTTP server for the RPC.
//
//   node --test scripts/release/version.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { describe, test } from 'node:test';

import { commit, git, repositories, root, runScript } from './git-fixture.mjs';
import {
  checkMinAppVersion,
  checkRedeploy,
  lastMinAppVersion,
  latestReleaseTag,
  releaseDecision,
} from './version.mjs';

const script = path.join(root, 'scripts/release/version.mjs');
const repo = repositories('release-version-test');

const minVersionSql = (version) => `
create or replace function public.min_app_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '${version}'::text
$$;
`;
const FOUNDATION = 'supabase/migrations/20261121062343_foundation.sql';
const CONTRACT = 'supabase/migrations/20261210000000_drop_notes.sql';

describe('tags', () => {
  test('the latest release tag is the highest version, not the last one listed', () => {
    assert.equal(
      latestReleaseTag(['v2026.12.10', 'v2026.12.9', 'v2027.1.1', 'v2026.11.3']),
      'v2027.1.1',
    );
    assert.equal(latestReleaseTag(['v2026.12.2', 'v2026.12.10']), 'v2026.12.10');
    assert.equal(latestReleaseTag(['release-1', 'v1.2', 'v2026.13.1']), undefined);
    assert.equal(latestReleaseTag([]), undefined);
  });
});

describe('AC-020: docs only, no release', () => {
  test('only docs/, .agents/, .claude/ and Markdown files: no release', () => {
    const decision = releaseDecision([
      'docs/architecture/betrieb.md',
      '.claude/rules/00-core.md',
      '.agents/glossary.md',
      'README.md',
      'apps/app/README.md',
    ]);
    assert.equal(decision.release, false);
    assert.match(decision.reason, /nur Dokumentation/);
  });

  test('one .ts file among them: release', () => {
    const decision = releaseDecision(['docs/x.md', 'packages/core/src/app-version.ts']);
    assert.equal(decision.release, true);
  });

  test('a file under docs/ that is not Markdown is still documentation', () => {
    assert.equal(releaseDecision(['docs/design/screen.png']).release, false);
  });

  test('no change since the last tag: no release', () => {
    const decision = releaseDecision([]);
    assert.equal(decision.release, false);
    assert.match(decision.reason, /Keine Änderungen/);
  });
});

describe('forced release (workflow_dispatch of release.yml, e.g. after a disaster restore)', () => {
  test('docs only or no change at all: release anyway, and the reason says so', () => {
    for (const files of [[], ['docs/architecture/betrieb.md']]) {
      const decision = releaseDecision(files, { force: true });
      assert.equal(decision.release, true);
      assert.match(decision.reason, /erzwungen/);
    }
  });

  test('with code changes a forced release is an ordinary one', () => {
    const decision = releaseDecision(['packages/core/src/app-version.ts'], { force: true });
    assert.equal(decision.release, true);
  });
});

describe('minimum version', () => {
  test('the last definition in file order wins', () => {
    assert.equal(
      lastMinAppVersion([
        { file: '20261210000000_drop_notes.sql', sql: minVersionSql('2026.12.3') },
        { file: '20261121062343_foundation.sql', sql: minVersionSql('2026.1.1') },
        { file: '20261211000000_other.sql', sql: 'create table public.x (id int);' },
      ]),
      '2026.12.3',
    );
  });

  test('a definition only inside a comment does not count', () => {
    assert.equal(
      lastMinAppVersion([
        { file: '1_a.sql', sql: minVersionSql('2026.1.1') },
        { file: '2_b.sql', sql: `-- ${minVersionSql('2026.12.9').replaceAll('\n', '\n-- ')}` },
      ]),
      '2026.1.1',
    );
  });

  test('no definition at all is an error, not a guess', () => {
    assert.throws(() => lastMinAppVersion([{ file: '1_a.sql', sql: 'select 1;' }]), /keine/);
  });

  test('AC-026: a minimum version above the last published version aborts with the message of the spec', () => {
    assert.equal(
      checkMinAppVersion({ min: '2026.12.9', published: '2026.12.4', next: '2026.12.5' }),
      'Mindestversion 2026.12.9 ist noch nicht veröffentlicht',
    );
  });

  test('AC-026: the new version itself is not yet published either', () => {
    assert.equal(
      checkMinAppVersion({ min: '2026.12.5', published: '2026.12.4', next: '2026.12.5' }),
      'Mindestversion 2026.12.5 ist noch nicht veröffentlicht',
    );
  });

  test('AC-026: at or below the last published version passes', () => {
    assert.equal(
      checkMinAppVersion({ min: '2026.12.4', published: '2026.12.4', next: '2026.12.5' }),
      undefined,
    );
    assert.equal(
      checkMinAppVersion({ min: '2026.1.1', published: '2026.12.4', next: '2026.12.5' }),
      undefined,
    );
  });

  test('before the first release the start value passes, a value above the new version does not', () => {
    assert.equal(
      checkMinAppVersion({ min: '2026.1.1', published: undefined, next: '2026.11.1' }),
      undefined,
    );
    assert.equal(
      checkMinAppVersion({ min: '2026.12.1', published: undefined, next: '2026.11.1' }),
      'Mindestversion 2026.12.1 ist noch nicht veröffentlicht',
    );
  });

  test('an invalid minimum version is an error with its value', () => {
    assert.throws(
      () => checkMinAppVersion({ min: '2026.13.1', published: '2026.12.4', next: '2026.12.5' }),
      /2026\.13\.1/,
    );
  });
});

describe('minimum version with the new migration base (spec 0031, REQ-001)', () => {
  test('AC-005: with the exception 2026.11.2 may be above the published 2026.11.1, up to the new version', () => {
    for (const next of ['2026.11.2', '2026.12.1']) {
      assert.equal(
        checkMinAppVersion({ min: '2026.11.2', published: '2026.11.1', next, newBase: true }),
        undefined,
      );
    }
  });

  test('AC-005: without the exception min above published stays red, above next always', () => {
    assert.match(
      checkMinAppVersion({ min: '2026.11.2', published: '2026.11.1', next: '2026.11.2' }),
      /Mindestversion 2026\.11\.2 ist noch nicht veröffentlicht/,
    );
    assert.match(
      checkMinAppVersion({
        min: '2026.12.1',
        published: '2026.11.1',
        next: '2026.11.2',
        newBase: true,
      }),
      /Mindestversion 2026\.12\.1 ist noch nicht veröffentlicht/,
    );
  });

  test('AC-006: after the release v2026.11.1 is refused for a redeploy', () => {
    assert.match(
      checkRedeploy({ tag: 'v2026.11.1', min: '2026.11.2' }).error,
      /unter der Mindestversion/,
    );
  });
});

describe('AC-033: redeploy of an earlier web version', () => {
  test('a tag at or above the minimum version is accepted', () => {
    assert.deepEqual(checkRedeploy({ tag: 'v2026.12.4', min: '2026.12.2' }), {
      version: '2026.12.4',
    });
    assert.deepEqual(checkRedeploy({ tag: 'v2026.12.2', min: '2026.12.2' }), {
      version: '2026.12.2',
    });
  });

  test('a tag below the minimum version is refused', () => {
    assert.deepEqual(checkRedeploy({ tag: 'v2026.12.1', min: '2026.12.2' }), {
      error: 'v2026.12.1 liegt unter der Mindestversion 2026.12.2 und wird nicht ausgeliefert',
    });
  });

  test('something that is not a release tag is refused', () => {
    for (const tag of ['2026.12.4', 'v2026.12', 'main', 'v2026.12.4; rm -rf /']) {
      assert.match(
        checkRedeploy({ tag, min: '2026.1.1' }).error,
        /kein Tag einer Veröffentlichung/,
      );
    }
  });
});

describe('CLI', () => {
  /** A repository with the foundation migration (start value 2026.1.1). */
  function repoWithFoundation() {
    const cwd = repo();
    commit(cwd, 'feat: Grundlage', { [FOUNDATION]: minVersionSql('2026.1.1') });
    return cwd;
  }

  const outputs = (file) =>
    Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=')),
    );

  function run(cwd, args, env = {}) {
    const out = path.join(cwd, 'github-output.txt');
    writeFileSync(out, '');
    const result = runScript(script, cwd, args, { GITHUB_OUTPUT: out, ...env });
    return { ...result, outputs: outputs(out) };
  }

  test('AC-018: the first release in November 2026 is 2026.11.1', () => {
    const cwd = repoWithFoundation();
    const { status, output, outputs: o } = run(cwd, ['--now', '2026-11-21T12:00:00Z']);
    assert.equal(status, 0, output);
    assert.deepEqual(o, {
      version: '2026.11.1',
      tag: 'v2026.11.1',
      previous: '',
      release: 'true',
    });
  });

  test('security check 0031: a tag outside the first-parent history of the release branch counts not', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.11.1');
    git(cwd, 'checkout', '-q', '-b', 'chore/x');
    commit(cwd, 'chore: x', { 'x.txt': 'x\n' });
    git(cwd, 'tag', 'v2099.12.1');
    git(cwd, 'checkout', '-q', '-');
    commit(cwd, 'feat: Reisetaschen', { 'packages/core/src/bag.ts': 'export const x = 1;\n' });
    const result = run(cwd, ['--now', '2026-11-25T12:00:00Z']);
    assert.equal(result.status, 0, result.output);
    assert.equal(result.outputs.previous, '2026.11.1');
    assert.equal(result.outputs.version, '2026.11.2');
  });

  test('AC-018: after v2026.12.3 the next one in December is 2026.12.4, in January 2027.1.1', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.12.3');
    commit(cwd, 'feat: Reisetaschen', { 'packages/core/src/bag.ts': 'export const x = 1;\n' });
    const december = run(cwd, ['--now', '2026-12-20T12:00:00Z']);
    assert.equal(december.status, 0, december.output);
    assert.equal(december.outputs.version, '2026.12.4');
    assert.equal(december.outputs.tag, 'v2026.12.4');
    assert.equal(december.outputs.previous, '2026.12.3');
    // 23:30 UTC on 31 December is already January in Berlin.
    const january = run(cwd, ['--now', '2026-12-31T23:30:00Z']);
    assert.equal(january.outputs.version, '2027.1.1');
  });

  test('AC-020: docs only since the last tag: release=false, exit 0', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.12.3');
    commit(cwd, 'docs: Runbook', {
      'docs/architecture/betrieb.md': '# Betrieb\n',
      '.claude/rules/x.md': 'x\n',
      'README.md': '# Housekeeping\n',
    });
    const { status, output, outputs: o } = run(cwd, ['--now', '2026-12-20T12:00:00Z']);
    assert.equal(status, 0, output);
    assert.equal(o.release, 'false');
    assert.match(output, /nur Dokumentation/);
  });

  test('--force: no change since the last tag still makes the next version a release', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.12.3');
    const { status, output, outputs: o } = run(cwd, ['--now', '2026-12-20T12:00:00Z', '--force']);
    assert.equal(status, 0, output);
    assert.equal(o.release, 'true');
    assert.equal(o.version, '2026.12.4');
    assert.match(output, /erzwungen/);
  });

  test('--force does not skip the minimum version guard (AC-026)', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.12.4');
    commit(cwd, 'refactor!: Notizen entfernen', {
      [CONTRACT]: `-- contract: Notizen entfernt; min_app_version: 2026.12.9\nalter table public.recipes drop column notes;\n${minVersionSql('2026.12.9')}`,
    });
    const { status, outputs: o } = run(cwd, ['--now', '2026-12-20T12:00:00Z', '--force']);
    assert.equal(status, 1);
    assert.equal(o.release, undefined);
  });

  test('AC-026: a minimum version that is not published aborts before anything is delivered', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.12.4');
    commit(cwd, 'refactor!: Notizen entfernen', {
      [CONTRACT]: `-- contract: Notizen entfernt; min_app_version: 2026.12.9\nalter table public.recipes drop column notes;\n${minVersionSql('2026.12.9')}`,
    });
    const { status, output, outputs: o } = run(cwd, ['--now', '2026-12-20T12:00:00Z']);
    assert.equal(status, 1, output);
    assert.match(output, /Mindestversion 2026\.12\.9 ist noch nicht veröffentlicht/);
    assert.equal(o.release, undefined, 'no outputs: the jobs after it must not start');
  });

  test('AC-005: migrations-base.json naming the latest tag lets the new base raise the minimum to the next version', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.11.1');
    commit(cwd, 'feat: neue Basis', { [CONTRACT]: minVersionSql('2026.11.2') });
    const without = run(cwd, ['--now', '2026-11-24T12:00:00Z']);
    assert.equal(without.status, 1, without.output);
    commit(cwd, 'feat: Ausnahme', {
      'supabase/migrations-base.json': JSON.stringify({
        replaces: 'v2026.11.1',
        first: '20261124000000',
      }),
    });
    const { status, output, outputs: o } = run(cwd, ['--now', '2026-11-24T12:00:00Z']);
    assert.equal(status, 0, output);
    assert.equal(o.version, '2026.11.2');
    assert.match(output, /Mindestversion 2026\.11\.2/);
  });

  test('in GitHub Actions the error is a workflow command', () => {
    const cwd = repoWithFoundation();
    git(cwd, 'tag', 'v2026.12.4');
    commit(cwd, 'refactor!: x', { [CONTRACT]: minVersionSql('2026.12.9') });
    const { status, stdout } = run(cwd, ['--now', '2026-12-20T12:00:00Z'], {
      GITHUB_ACTIONS: 'true',
    });
    assert.equal(status, 1);
    assert.match(stdout, /^::error::Mindestversion 2026\.12\.9/m);
  });

  /** A local stand-in for POST /rest/v1/rpc/min_app_version; records the request headers. */
  async function rpcServer(reply) {
    const requests = [];
    const server = createServer((req, res) => {
      requests.push({ method: req.method, url: req.url, headers: req.headers });
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(reply.body);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return { url: `http://127.0.0.1:${port}`, requests, close: () => server.close() };
  }

  // The server runs in this process, so the script must not block it (no spawnSync).
  const runAsync = (cwd, args, env) =>
    new Promise((resolve) => {
      const out = path.join(cwd, 'github-output.txt');
      writeFileSync(out, '');
      execFile(
        process.execPath,
        [script, ...args],
        { cwd, env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_OUTPUT: out, ...env } },
        (error, stdout, stderr) =>
          resolve({
            status: error ? error.code : 0,
            output: `${stdout}${stderr}`,
            outputs: outputs(out),
          }),
      );
    });

  test('AC-033: --redeploy reads the minimum version of production and accepts v2026.12.4', async () => {
    const server = await rpcServer({ status: 200, body: '"2026.12.2"' });
    try {
      const cwd = repoWithFoundation();
      const result = await runAsync(
        cwd,
        ['--redeploy', 'v2026.12.4', '--supabase-url', server.url],
        { SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
      );
      assert.equal(result.status, 0, result.output);
      assert.deepEqual(result.outputs, { version: '2026.12.4', tag: 'v2026.12.4' });
      assert.equal(server.requests[0].method, 'POST');
      assert.equal(server.requests[0].url, '/rest/v1/rpc/min_app_version');
      assert.equal(server.requests[0].headers.apikey, 'sb_publishable_test');
      assert.doesNotMatch(result.output, /sb_publishable_test/);
    } finally {
      server.close();
    }
  });

  test('AC-033: --redeploy refuses a tag below the minimum version', async () => {
    const server = await rpcServer({ status: 200, body: '"2026.12.5"' });
    try {
      const result = await runAsync(
        repoWithFoundation(),
        ['--redeploy', 'v2026.12.4', '--supabase-url', server.url],
        { SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
      );
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /v2026\.12\.4 liegt unter der Mindestversion 2026\.12\.5/);
      assert.deepEqual(result.outputs, {});
    } finally {
      server.close();
    }
  });

  test('--redeploy fails when the minimum version cannot be read', async () => {
    const server = await rpcServer({ status: 503, body: '{"message":"paused"}' });
    try {
      const result = await runAsync(
        repoWithFoundation(),
        ['--redeploy', 'v2026.12.4', '--supabase-url', server.url],
        { SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
      );
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /Mindestversion.*nicht lesen.*503/);
    } finally {
      server.close();
    }
  });
});
