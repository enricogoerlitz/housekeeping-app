// scripts/ci/conventions.mjs (spec 0014, Task 1): pull request title and branch, the base of a PR
// to main, forbidden Supabase commands and action pins. Pure functions plus the CLI against a
// throwaway git repository under tmp/ (git-ignored), removed afterwards.
//
//   node --test scripts/ci/conventions.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MESSAGES,
  checkPullRequest,
  findForbiddenCommands,
  findUnpinnedActions,
  pullRequestFromEvent,
} from './conventions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/ci/conventions.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'conventions-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const SHA = 'a'.repeat(40);

describe('title and branch', () => {
  test('AC-004: a wrong title and a wrong branch are reported together', () => {
    const problems = checkPullRequest({
      title: 'Reisetaschen fertig',
      head: 'reisetaschen',
      base: 'develop',
    });
    assert.deepEqual(problems, [MESSAGES.title, MESSAGES.branch]);
    assert.match(MESSAGES.title, /feat, fix, refactor, test, docs, chore/);
    assert.match(MESSAGES.branch, /„<typ>\/<slug>“/);
  });

  test('AC-004: conventional titles and branches pass', () => {
    for (const title of [
      'feat: Reisetaschen',
      'fix(sync): Cursor nach Fehler',
      'chore(deps): bump actions/checkout from 6.0.0 to 7.0.1',
      'refactor!: neue Grundlage',
    ]) {
      assert.deepEqual(
        checkPullRequest({ title, head: 'feat/0012-reisetaschen', base: 'develop' }),
        [],
      );
    }
    for (const title of [
      'Feat: groß',
      'feat:ohne Leerzeichen',
      'feature: x',
      'feat(Sync): x',
      'feat: ',
    ]) {
      assert.deepEqual(
        checkPullRequest({ title, head: 'feat/x', base: 'develop' }),
        [MESSAGES.title],
        title,
      );
    }
  });

  test('AC-004: dependabot/…, hotfix/<slug> and develop → main are valid branches', () => {
    const ok = (head, base) => checkPullRequest({ title: 'chore: x', head, base });
    assert.deepEqual(ok('dependabot/github_actions/actions/checkout-7.0.1', 'develop'), []);
    assert.deepEqual(ok('hotfix/anmeldung-ios', 'main'), []);
    assert.deepEqual(ok('develop', 'main'), []);
    assert.deepEqual(ok('chore/rueckfuehrung-v2026.11.1', 'develop'), []);
    for (const head of ['Feat/x', 'feat/', 'feat/X', 'feature/x', 'hotfix/', 'develop']) {
      assert.deepEqual(ok(head, 'develop'), [MESSAGES.branch], head);
    }
  });

  test('AC-065: feat/0012-reisetaschen → main is red, → develop is green', () => {
    const pr = { title: 'feat: Reisetaschen', head: 'feat/0012-reisetaschen' };
    assert.deepEqual(checkPullRequest({ ...pr, base: 'main' }), [MESSAGES.main]);
    assert.equal(MESSAGES.main, 'Nach main nur von develop oder hotfix/…');
    assert.deepEqual(checkPullRequest({ ...pr, base: 'develop' }), []);
    assert.deepEqual(
      checkPullRequest({ title: 'chore: x', head: 'dependabot/npm/x', base: 'main' }),
      [MESSAGES.main],
    );
  });

  test('the pull request comes from the event, or from a lookup on workflow_dispatch', () => {
    const event = {
      pull_request: { title: 'feat: x', head: { ref: 'feat/x' }, base: { ref: 'develop' } },
    };
    assert.deepEqual(
      pullRequestFromEvent('pull_request', event, 'feat/x', () => undefined),
      {
        title: 'feat: x',
        head: 'feat/x',
        base: 'develop',
      },
    );
    const found = { title: 'chore: Rückführung', head: 'chore/rueckfuehrung-v1', base: 'develop' };
    let asked;
    const lookup = (branch) => {
      asked = branch;
      return found;
    };
    assert.deepEqual(
      pullRequestFromEvent('workflow_dispatch', {}, 'chore/rueckfuehrung-v1', lookup),
      found,
    );
    assert.equal(asked, 'chore/rueckfuehrung-v1');
    assert.equal(pullRequestFromEvent('push', {}, 'develop', lookup), undefined);
  });
});

describe('forbidden commands', () => {
  const file = (filePath, text) => ({ path: filePath, text });

  test('AC-010: db reset against a remote project is red in every variant', () => {
    for (const flag of ['--remote', '--linked', '--db-url postgres://x']) {
      const found = findForbiddenCommands([
        file(
          '.github/workflows/release.yml',
          `      - run: pnpm exec supabase db reset ${flag} --yes\n`,
        ),
      ]);
      assert.equal(found.length, 1, flag);
      assert.equal(found[0].path, '.github/workflows/release.yml');
      assert.equal(found[0].line, 1);
      assert.match(found[0].message, /db reset/);
    }
    // Spread over a continued shell line and as an argument list in a script.
    assert.equal(
      findForbiddenCommands([file('scripts/x.sh', 'supabase db reset \\\n  --linked\n')]).length,
      1,
    );
    assert.equal(
      findForbiddenCommands([
        file('scripts/x.mjs', "spawnSync('supabase', ['db', 'reset', '--db-url', url]);\n"),
      ]).length,
      1,
    );
    assert.equal(
      findForbiddenCommands([file('package.json', '"x": "supabase db reset --remote"')]).length,
      1,
    );
  });

  test('AC-010: the reset is allowed only in preview.yml; a local reset is fine', () => {
    assert.deepEqual(
      findForbiddenCommands([
        file('.github/workflows/preview.yml', 'run: supabase db reset --remote --no-seed --yes\n'),
      ]),
      [],
    );
    assert.deepEqual(
      findForbiddenCommands([
        file('scripts/db-reset.mjs', "run(supabase, ['db', 'reset']);\n"),
        file('package.json', '"db:reset": "node scripts/db-reset.mjs"'),
      ]),
      [],
    );
  });

  test('AC-010: db push --include-seed and migration repair are red everywhere', () => {
    const found = findForbiddenCommands([
      file('.github/workflows/preview.yml', 'run: supabase db push --remote --include-seed\n'),
      file('scripts/fix.sh', 'echo\nsupabase migration repair --status reverted 1\n'),
    ]);
    assert.deepEqual(
      found.map(({ path: p, line }) => `${p}:${line}`),
      ['.github/workflows/preview.yml:1', 'scripts/fix.sh:2'],
    );
    assert.deepEqual(
      findForbiddenCommands([file('x.yml', 'run: supabase db push --remote --skip-vault --yes\n')]),
      [],
    );
  });
});

describe('action pins', () => {
  test('AC-062: an action pinned only by tag is red; SHA, local and docker digest pass', () => {
    const text = [
      'jobs:',
      '  a:',
      '    steps:',
      `      - uses: actions/checkout@${SHA} # v7.0.1`,
      '      - uses: actions/setup-node@v7',
      "      - uses: 'pnpm/action-setup@main'",
      `      - uses: docker://rhysd/actionlint@sha256:${'b'.repeat(64)}`,
      '      - uses: docker://rhysd/actionlint:1.7.12',
      '  b:',
      '    uses: ./.github/workflows/checks.yml',
      `  c:\n    uses: octo/repo/.github/workflows/x.yml@${SHA}`,
    ].join('\n');
    const found = findUnpinnedActions([{ path: '.github/workflows/x.yml', text }]);
    assert.deepEqual(
      found.map(({ line, message }) => `${line} ${message}`),
      [
        '5 Action nicht per Commit-SHA festgelegt: actions/setup-node@v7',
        '6 Action nicht per Commit-SHA festgelegt: pnpm/action-setup@main',
        '8 Action nicht per Commit-SHA festgelegt: docker://rhysd/actionlint:1.7.12',
      ],
    );
  });
});

describe('CLI', () => {
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };

  function repo(name, files) {
    const repoDir = path.join(dir, name);
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(repoDir, file)), { recursive: true });
      writeFileSync(path.join(repoDir, file), text);
    }
    git(repoDir, 'init', '-q');
    return repoDir;
  }

  function run(cwd, args, env = {}) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_EVENT_NAME: '', ...env },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }

  test('AC-004: the CLI reads the pull request from the event and reports both problems', () => {
    const cwd = repo('event', { 'package.json': '{}' });
    const eventFile = path.join(dir, 'event.json');
    writeFileSync(
      eventFile,
      JSON.stringify({
        pull_request: {
          title: 'Reisetaschen fertig',
          head: { ref: 'reisetaschen' },
          base: { ref: 'develop' },
        },
      }),
    );
    const { status, output } = run(cwd, [], {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventFile,
    });
    assert.equal(status, 1, output);
    assert.ok(output.includes(MESSAGES.title), output);
    assert.ok(output.includes(MESSAGES.branch), output);
  });

  test('AC-010, AC-062: the CLI scans workflows, scripts and package.json, also untracked ones', () => {
    const cwd = repo('files', {
      '.github/workflows/release.yml':
        'jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n',
      'scripts/reset.sh': 'supabase db reset --linked\n',
      'scripts/ci/conventions.mjs': '// may name: supabase db reset --remote\n',
      'docs/betrieb.md': 'supabase db reset --remote\n',
      'package.json': '{}',
    });
    const { status, output } = run(cwd, [
      '--title',
      'feat: x',
      '--head',
      'feat/x',
      '--base',
      'develop',
    ]);
    assert.equal(status, 1, output);
    assert.match(output, /\.github\/workflows\/release\.yml:4: Action nicht per Commit-SHA/);
    assert.match(output, /scripts\/reset\.sh:1: .*db reset/);
    assert.doesNotMatch(output, /conventions\.mjs|betrieb\.md/);
  });

  test('a clean repository passes and says what was checked', () => {
    const cwd = repo('clean', {
      '.github/workflows/checks.yml': `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA}\n`,
      'package.json': '{"scripts":{"db:reset":"node scripts/db-reset.mjs"}}',
      '.github/workflows/ci.yml': 'jobs: {}\n',
    });
    // A tracked workflow deleted in the working tree (not yet committed) is skipped.
    git(cwd, 'add', '.');
    rmSync(path.join(cwd, '.github/workflows/ci.yml'));
    const { status, output } = run(cwd, [
      '--title',
      'feat: x',
      '--head',
      'feat/x',
      '--base',
      'develop',
    ]);
    assert.equal(status, 0, output);
    assert.match(output, /Konventionen: ok/);
  });

  test('without a pull request (push) only the files are checked', () => {
    const cwd = repo('push', { 'package.json': '{}' });
    const { status, output } = run(cwd, [], { GITHUB_EVENT_NAME: 'push' });
    assert.equal(status, 0, output);
    assert.match(output, /keine PR/i);
  });
});
