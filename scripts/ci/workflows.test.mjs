// Structure of the GitHub workflows (spec 0014, Task 3; grows with Tasks 7 to 10). Workflows cannot
// run locally; this test and actionlint are their gate, the real runs follow in Task 13.
//
//   node --test scripts/ci/workflows.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, '.github/workflows');

const workflows = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file))
  .sort()
  .map((file) => {
    const text = readFileSync(path.join(dir, file), 'utf8');
    return { file, text, doc: parse(text) };
  });
const byFile = (file) => workflows.find((w) => w.file === file);

/** [{ workflow, id, job }] of every workflow. */
const allJobs = workflows.flatMap(({ file, doc }) =>
  Object.entries(doc.jobs ?? {}).map(([id, job]) => ({ workflow: file, id, job })),
);
const steps = (job) => job.steps ?? [];
const runs = (job) => steps(job).map((step) => step.run ?? '');

/** Required status checks of the rulesets (plan 0014, decision 28): the job names of checks.yml. */
const REQUIRED_CHECKS = [
  'Konventionen',
  'Geheimnisse',
  'Migrationen',
  'Prüfungen',
  'Datenbank (pgTAP)',
  'Deno-Lock',
  'E2E',
];
/** Jobs that skip on a docs-only pull request (AC-011); the others always run. */
const HEAVY = ['Prüfungen', 'Datenbank (pgTAP)', 'Deno-Lock', 'E2E'];

describe('all workflows', () => {
  test('the old ci.yml is replaced by checks.yml', () => {
    assert.equal(byFile('ci.yml'), undefined);
    assert.ok(byFile('checks.yml'));
  });

  test('AC-062: every action and reusable workflow is pinned to a commit SHA', () => {
    const unpinned = [];
    for (const { workflow, id, job } of allJobs) {
      const refs = [job.uses, ...steps(job).map((step) => step.uses)].filter(Boolean);
      for (const ref of refs) {
        const pinned =
          ref.startsWith('./') ||
          /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/.test(ref) ||
          /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ref);
        if (!pinned) unpinned.push(`${workflow} ${id}: ${ref}`);
      }
    }
    assert.deepEqual(unpinned, []);
  });

  test('pinned actions name their version in a comment, for review and Dependabot', () => {
    for (const { file, text } of workflows) {
      for (const line of text.split('\n')) {
        if (/uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}/.test(line)) {
          assert.match(line, /@[0-9a-f]{40} # v\d+(\.\d+)*$/, `${file}: ${line.trim()}`);
        }
      }
    }
  });

  test('no pull_request_target, default permissions contents: read', () => {
    for (const { file, doc } of workflows) {
      assert.ok(!('pull_request_target' in (doc.on ?? {})), file);
      assert.deepEqual(doc.permissions, { contents: 'read' }, file);
    }
  });

  test('no job with an environment installs packages', () => {
    for (const { workflow, id, job } of allJobs) {
      if (!job.environment) continue;
      for (const run of runs(job)) {
        assert.doesNotMatch(run, /\b(pnpm|npm|yarn)\s+(install|i|ci|add)\b/, `${workflow} ${id}`);
      }
      assert.ok(
        !steps(job).some((step) => step.uses?.startsWith('pnpm/action-setup@')),
        `${workflow} ${id} sets up pnpm`,
      );
    }
  });

  test('no set -x, no --debug', () => {
    for (const { workflow, id, job } of allJobs) {
      for (const run of runs(job)) {
        assert.doesNotMatch(run, /\bset\s+-[a-wyz]*x|--debug\b/, `${workflow} ${id}`);
      }
    }
  });

  test('AC-062: the repository passes its own check "Konventionen"', () => {
    const result = spawnSync(process.execPath, ['scripts/ci/conventions.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_EVENT_NAME: '' },
    });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
});

describe('checks.yml', () => {
  const checks = byFile('checks.yml');
  const jobs = Object.entries(checks?.doc.jobs ?? {});
  const job = (name) => jobs.find(([, j]) => j.name === name)?.[1];
  const runOf = (name) => runs(job(name) ?? {}).join('\n');

  test('runs on pull requests, when called and by hand; never on push', () => {
    const on = checks.doc.on;
    assert.ok('pull_request' in on);
    assert.ok('workflow_call' in on);
    assert.ok('workflow_dispatch' in on);
    assert.ok(!('push' in on));
    // A corrected title or a new base reruns "Konventionen".
    assert.ok(on.pull_request.types.includes('edited'));
  });

  test('AC-006: no job has an environment, none reads a secret', () => {
    for (const [id, j] of jobs) assert.equal(j.environment, undefined, id);
    assert.doesNotMatch(checks.text, /secrets\./);
  });

  test('AC-002: the job names are exactly the required checks plus "Änderungen"', () => {
    const names = jobs.map(([, j]) => j.name);
    assert.deepEqual([...names].sort(), ['Änderungen', ...REQUIRED_CHECKS].sort());
  });

  test('AC-011: heavy jobs skip only on a docs-only PR; if "Änderungen" fails they run', () => {
    const changes = jobs.find(([, j]) => j.name === 'Änderungen');
    assert.ok(changes);
    const [changesId, changesJob] = changes;
    assert.ok(changesJob.outputs?.code);
    for (const name of HEAVY) {
      const j = job(name);
      assert.deepEqual([j.needs].flat(), [changesId], name);
      assert.equal(
        j.if,
        `\${{ !cancelled() && needs.${changesId}.outputs.code != 'false' }}`,
        name,
      );
    }
    for (const name of ['Konventionen', 'Geheimnisse', 'Migrationen']) {
      assert.equal(job(name).if, undefined, name);
      assert.equal(job(name).needs, undefined, name);
    }
    // Only pull requests can be docs-only; everything else counts as code.
    const script = runs(changesJob).join('\n');
    assert.match(script, /pull_request/);
    assert.match(script, /docs\/|\\\.md/);
  });

  test('pull request runs replace each other, called runs never cancel', () => {
    assert.match(
      checks.doc.concurrency['cancel-in-progress'],
      /github\.event_name == 'pull_request'/,
    );
    assert.match(checks.doc.concurrency.group, /github\.run_id/);
  });

  test('"Konventionen" runs the script and actionlint by digest', () => {
    assert.match(runOf('Konventionen'), /node scripts\/ci\/conventions\.mjs/);
    assert.match(runOf('Konventionen'), /rhysd\/actionlint(:[\w.]+)?@sha256:[0-9a-f]{64}/);
  });

  test('AC-008: "Geheimnisse" verifies the gitleaks download and scans the PR commits redacted', () => {
    const j = job('Geheimnisse');
    assert.match(j.env.GITLEAKS_VERSION, /^\d+\.\d+\.\d+$/);
    assert.match(j.env.GITLEAKS_SHA256, /^[0-9a-f]{64}$/);
    const script = runOf('Geheimnisse');
    assert.match(script, /sha256sum -c/);
    assert.match(script, /gitleaks"? git /);
    for (const flag of ['--redact', '--ignore-gitleaks-allow', '--log-opts=', '--config']) {
      assert.ok(script.includes(flag), flag);
    }
  });

  test('AC-009: "Migrationen" and "Geheimnisse" check out the full history with tags', () => {
    for (const name of ['Migrationen', 'Geheimnisse', 'Änderungen']) {
      const checkout = steps(job(name)).find((step) => step.uses?.startsWith('actions/checkout@'));
      assert.equal(checkout?.with?.['fetch-depth'], 0, name);
    }
    assert.match(runOf('Migrationen'), /node scripts\/ci\/migrations\.mjs --base "\$base"/);
  });

  test('AC-006: format, check, web build, pgTAP and both e2e runs', () => {
    assert.match(runOf('Prüfungen'), /pnpm format:check/);
    assert.match(runOf('Prüfungen'), /pnpm check/);
    assert.match(runOf('Prüfungen'), /pnpm build:web/);
    assert.match(runOf('Datenbank (pgTAP)'), /supabase db start/);
    assert.match(runOf('Datenbank (pgTAP)'), /supabase test db/);
    assert.match(runOf('E2E'), /supabase start/);
    assert.match(runOf('E2E'), /pnpm e2e\n/);
    assert.match(runOf('E2E'), /pnpm e2e:dev/);
  });

  test('throwaway VAPID keys per run, masked, before the web build and the local stack', () => {
    for (const [name, before] of [
      ['Prüfungen', /pnpm build:web/],
      ['E2E', /supabase start/],
    ]) {
      const list = runs(job(name));
      const keys = list.findIndex((run) =>
        /node scripts\/push-keys\.mjs --out "\$RUNNER_TEMP\//.test(run),
      );
      assert.ok(keys >= 0, name);
      assert.match(list[keys], /::add-mask::/);
      assert.match(list[keys], /GITHUB_ENV/);
      assert.match(list[keys], /rm -f "\$RUNNER_TEMP\//);
      assert.ok(keys < list.findIndex((run) => before.test(run)), name);
    }
  });

  test('AC-074: "Deno-Lock" pins the Deno of the edge runtime and installs frozen', () => {
    const j = job('Deno-Lock');
    assert.match(j.env.DENO_VERSION, /^\d+\.\d+\.\d+$/);
    const setup = steps(j).find((step) => step.uses?.startsWith('denoland/setup-deno@'));
    assert.equal(setup?.with?.['deno-version'], '${{ env.DENO_VERSION }}');
    const install = steps(j).find((step) =>
      /deno install --frozen --entrypoint index\.ts/.test(step.run ?? ''),
    );
    assert.equal(install?.['working-directory'], 'supabase/functions/push-send');
    assert.match(install.run, /git diff --exit-code -- deno\.lock/);
  });

  test('AC-074: push-send resolves its dependencies through a frozen lock file', () => {
    const config = JSON.parse(
      readFileSync(path.join(root, 'supabase/functions/push-send/deno.json'), 'utf8'),
    );
    assert.deepEqual(config.lock, { path: './deno.lock', frozen: true });
  });
});

test('workflow files parse as YAML', () => {
  for (const { file, doc } of workflows) assert.equal(typeof doc, 'object', file);
  assert.ok(existsSync(path.join(root, '.github/dependabot.yml')));
});
