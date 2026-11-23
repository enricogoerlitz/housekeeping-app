// Structure of the GitHub workflows (spec 0014, Tasks 3 and 7 to 10). Workflows cannot
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
];
/** Jobs that skip on a docs-only pull request (AC-011); the others always run. */
const HEAVY = ['Prüfungen', 'Datenbank (pgTAP)', 'Deno-Lock'];

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

  test('AC-011 (spec 0031): runs on pull requests, after every merge to develop, when called and by hand', () => {
    const on = checks.doc.on;
    assert.deepEqual(Object.keys(on).sort(), [
      'pull_request',
      'push',
      'workflow_call',
      'workflow_dispatch',
    ]);
    assert.deepEqual(on.push, { branches: ['develop'] });
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

  test('AC-011 (spec 0031): a push to develop has its own group per commit and is never cancelled', () => {
    const { group } = checks.doc.concurrency;
    assert.match(
      group,
      /github\.event_name == 'push' && github\.ref == 'refs\/heads\/develop' && format\('develop-\{0\}', github\.sha\)/,
    );
    // The pull request number comes first, the run id last: only a push to develop gets the
    // develop group, a release on main (push, called) keeps its run id.
    assert.ok(group.indexOf('pull_request.number') < group.indexOf("'develop-"));
    assert.ok(group.indexOf("'develop-") < group.indexOf('github.run_id'));
    assert.doesNotMatch(checks.doc.concurrency['cancel-in-progress'], /push/);
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

  test('AC-006: format, check, web build and pgTAP; the e2e suites run locally only', () => {
    assert.match(runOf('Prüfungen'), /pnpm format:check/);
    assert.match(runOf('Prüfungen'), /pnpm check/);
    assert.match(runOf('Prüfungen'), /pnpm build:web/);
    assert.match(runOf('Datenbank (pgTAP)'), /supabase db start/);
    assert.match(runOf('Datenbank (pgTAP)'), /supabase test db/);
    for (const { file, text } of workflows) {
      assert.doesNotMatch(text, /pnpm e2e/, file);
    }
  });

  test('throwaway VAPID keys per run, masked, before the web build and the local stack', () => {
    for (const [name, before] of [['Prüfungen', /pnpm build:web/]]) {
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

describe('infra/github rulesets (Task 10, decision 28)', () => {
  const read = (name) => {
    const file = path.join(root, 'infra/github', `ruleset-${name}.json`);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  };
  const rulesets = { develop: read('develop'), main: read('main'), tags: read('tags') };
  const rule = (set, type) => set?.rules.find((r) => r.type === type);
  /** Every job name of checks.yml except the helper "Änderungen". */
  const checkJobNames = Object.values(byFile('checks.yml')?.doc.jobs ?? {})
    .map((j) => j.name)
    .filter((name) => name !== 'Änderungen')
    .sort();
  // The GitHub Actions app: only check runs from Actions can satisfy a required check.
  const GITHUB_ACTIONS_APP_ID = 15368;

  test('AC-001: three active rulesets, for develop, main and tags v*; develop and main without any bypass', () => {
    for (const [name, set] of Object.entries(rulesets)) {
      assert.ok(set, `infra/github/ruleset-${name}.json`);
      assert.equal(set.enforcement, 'active', name);
    }
    assert.deepEqual(rulesets.develop.bypass_actors, []);
    assert.deepEqual(rulesets.main.bypass_actors, []);
    assert.deepEqual(rulesets.develop.conditions.ref_name.include, ['refs/heads/develop']);
    assert.deepEqual(rulesets.main.conditions.ref_name.include, ['refs/heads/main']);
    assert.deepEqual(rulesets.tags.conditions.ref_name.include, ['refs/tags/v*']);
    assert.equal(rulesets.develop.target, 'branch');
    assert.equal(rulesets.main.target, 'branch');
    assert.equal(rulesets.tags.target, 'tag');
  });

  test('AC-001: develop and main take changes only through pull requests; no force push, no deletion', () => {
    for (const name of ['develop', 'main']) {
      const set = rulesets[name];
      assert.ok(rule(set, 'deletion'), name);
      assert.ok(rule(set, 'non_fast_forward'), name);
      const pr = rule(set, 'pull_request');
      assert.ok(pr, name);
      // One owner, and the hand-back merges itself: an approval could never be given.
      assert.equal(pr.parameters.required_approving_review_count, 0, name);
    }
  });

  test('AC-003, AC-066: develop allows squash and merge commit, main only merge commit', () => {
    const methods = (set) => [...rule(set, 'pull_request').parameters.allowed_merge_methods].sort();
    assert.deepEqual(methods(rulesets.develop), ['merge', 'squash']);
    assert.deepEqual(methods(rulesets.main), ['merge']);
  });

  test('AC-002: the required checks are exactly the job names of checks.yml, from GitHub Actions', () => {
    assert.deepEqual(checkJobNames, [...REQUIRED_CHECKS].sort());
    for (const name of ['develop', 'main']) {
      const checks = rule(rulesets[name], 'required_status_checks')?.parameters;
      assert.ok(checks, name);
      assert.deepEqual(
        checks.required_status_checks.map((c) => c.context).sort(),
        checkJobNames,
        name,
      );
      for (const c of checks.required_status_checks) {
        assert.equal(c.integration_id, GITHUB_ACTIONS_APP_ID, `${name}: ${c.context}`);
      }
      // "Up to date" is not required (decision 28).
      assert.equal(checks.strict_required_status_checks_policy, false, name);
    }
  });

  test('AC-020 (spec 0031): tags v* cannot be created, moved or deleted; only GitHub Actions creates them', () => {
    const types = rulesets.tags.rules.map((r) => r.type).sort();
    assert.deepEqual(types, ['creation', 'deletion', 'non_fast_forward', 'update']);
    // The release job creates the tag with GITHUB_TOKEN, the token of the GitHub Actions app.
    assert.deepEqual(rulesets.tags.bypass_actors, [
      { actor_id: GITHUB_ACTIONS_APP_ID, actor_type: 'Integration', bypass_mode: 'always' },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Delivery workflows (Tasks 7 and 8)
// ---------------------------------------------------------------------------------------------

const jobsOf = (file) => byFile(file)?.doc.jobs ?? {};
const needsOf = (job) => [job?.needs ?? []].flat();
const envName = (job) =>
  typeof job?.environment === 'string' ? job.environment : job?.environment?.name;
/** Index of the first step whose `run` matches, or -1. */
const stepIndex = (job, pattern) => steps(job).findIndex((step) => pattern.test(step.run ?? ''));
/** Asserts that the patterns match steps of `job` in this order. */
function assertOrder(job, patterns, label) {
  let last = -1;
  for (const pattern of patterns) {
    const index = stepIndex(job, pattern);
    assert.ok(index > last, `${label}: ${pattern} after step ${last} (found at ${index})`);
    last = index;
  }
}
// Built from pieces: the check "Konventionen" scans this file for the command it forbids.
const RESET = new RegExp(['supabase', 'db', 'reset'].join(' '));
const REMOTE_REF = '--remote="$SUPABASE_PROJECT_REF"';
/**
 * GitHub runners have no IPv6: commands that open a database connection use the session pooler.
 * `db query` with the ref runs over the Management API (HTTP) and stays on the ref.
 */
const REMOTE_POOLER = '--remote="$SUPABASE_POOLER_URL"';
const DATABASE_COMMAND = /^\s*supabase (db (reset|push|dump)|migration (list|repair))\b/;

describe('all delivery workflows', () => {
  test('AC-006, decision 3: a job without an environment never reads a secret', () => {
    for (const { workflow, id, job } of allJobs) {
      if (job.environment) continue;
      assert.doesNotMatch(JSON.stringify(job), /secrets\./, `${workflow} ${id}`);
    }
  });

  test('AC-013, AC-058, AC-071: preview only in preview.yml, production only in release and redeploy', () => {
    const where = (name) =>
      [
        ...new Set(
          allJobs.filter(({ job }) => envName(job) === name).map(({ workflow }) => workflow),
        ),
      ].sort();
    assert.deepEqual(where('preview'), ['preview.yml']);
    assert.deepEqual(where('production'), ['redeploy-web.yml', 'release.yml']);
    assert.doesNotMatch(byFile('preview.yml').text, /vars\.PRODUCTION_|secrets\.PRODUCTION_/);
    assert.doesNotMatch(byFile('release.yml').text, /vars\.PREVIEW_|secrets\.PREVIEW_/);
    assert.doesNotMatch(byFile('redeploy-web.yml').text, /vars\.PREVIEW_|secrets\.PREVIEW_/);
  });

  test('every Supabase command against the cloud names the project of its environment', () => {
    for (const file of ['preview.yml', 'release.yml', 'redeploy-web.yml']) {
      for (const [id, job] of Object.entries(jobsOf(file))) {
        for (const run of runs(job)) {
          for (const line of run.split('\n').filter((l) => /^\s*supabase /.test(l))) {
            const remote = DATABASE_COMMAND.test(line) ? REMOTE_POOLER : REMOTE_REF;
            assert.ok(line.includes(remote), `${file} ${id}: ${line.trim()}`);
            assert.doesNotMatch(
              line,
              /--linked|--db-url|--include-seed|--use-api/,
              `${file} ${id}`,
            );
          }
          if (/\bsupabase /.test(run))
            assert.equal(job.environment !== undefined, true, `${file} ${id}`);
        }
      }
    }
  });

  test('secrets set confirms with --yes and overrides every fixed value of [edge_runtime.secrets]', () => {
    // The CLI pushes the fixed values of config.toml with every `secrets set`; a local value such
    // as VAPID_SUBJECT = "https://localhost" must never reach a cloud project.
    const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
    const section = config.split(/^\[edge_runtime\.secrets\]$/m)[1].split(/^\[/m)[0];
    const fixed = [...section.matchAll(/^([A-Z0-9_]+)\s*=\s*"(?!env\()/gm)].map((m) => m[1]);
    assert.ok(fixed.includes('VAPID_SUBJECT'));
    for (const file of ['preview.yml', 'release.yml', 'redeploy-web.yml']) {
      for (const [id, job] of Object.entries(jobsOf(file))) {
        for (const run of runs(job).filter((r) => /supabase secrets set/.test(r))) {
          assert.match(run, / --yes /, `${file} ${id}`);
          for (const name of fixed)
            assert.match(run, new RegExp(`"${name}=`), `${file} ${id}: ${name}`);
        }
      }
    }
  });

  test('the pooler address comes from the job environment and is checked before the first database command', () => {
    for (const file of ['preview.yml', 'release.yml', 'redeploy-web.yml']) {
      for (const [id, job] of Object.entries(jobsOf(file))) {
        const first = runs(job).findIndex((run) =>
          run.split('\n').some((line) => DATABASE_COMMAND.test(line)),
        );
        if (first === -1) continue;
        assert.equal(
          job.env?.SUPABASE_POOLER_URL,
          '${{ secrets.SUPABASE_POOLER_URL }}',
          `${file} ${id}`,
        );
        assert.ok(job.environment, `${file} ${id}`);
        const guard = runs(job).findIndex((run) => /-z "\$SUPABASE_POOLER_URL"/.test(run));
        assert.ok(guard !== -1 && guard < first, `${file} ${id}`);
        // The address must belong to the project of this environment (security check 22.11.2026):
        // a production address in the preview secret would let the preview reset production.
        const check = runs(job)[guard];
        assert.match(check, /"postgres\.\$\{SUPABASE_PROJECT_REF\}"/, `${file} ${id}`);
      }
    }
  });

  test('AC-040: config push and the verification run on the prepared config of their environment', () => {
    for (const file of ['preview.yml', 'release.yml', 'redeploy-web.yml']) {
      for (const [id, job] of Object.entries(jobsOf(file))) {
        const uses = stepIndex(job, /supabase config push|scripts\/release\/verify\.mjs/);
        if (uses === -1) continue;
        const env = envName(job);
        const prepare = stepIndex(job, new RegExp(`node scripts/ci/supabase-remote\\.mjs ${env}$`));
        assert.ok(prepare !== -1 && prepare < uses, `${file} ${id}`);
        const prefix = env.toUpperCase();
        assert.equal(
          job.env?.[`${prefix}_WEB_ORIGIN`],
          `\${{ vars.${prefix}_WEB_ORIGIN }}`,
          `${file} ${id}`,
        );
        assert.equal(
          job.env?.[`${prefix}_WEB_ORIGIN_WILDCARD`],
          `\${{ vars.${prefix}_WEB_ORIGIN }}/**`,
          `${file} ${id}`,
        );
        assert.equal(
          job.env?.SUPABASE_PROJECT_REF,
          '${{ vars.SUPABASE_PROJECT_REF }}',
          `${file} ${id}`,
        );
      }
    }
  });

  test('AC-059: the deployment token is read at run time, masked before anything else, and never printed', () => {
    let deploys = 0;
    for (const { workflow, id, job } of allJobs) {
      const deploy = steps(job).findIndex((step) =>
        step.uses?.startsWith('Azure/static-web-apps-deploy@'),
      );
      if (deploy === -1) continue;
      deploys += 1;
      assert.ok(envName(job), `${workflow} ${id}: deploy without environment`);
      assert.equal(job.permissions?.['id-token'], 'write', `${workflow} ${id}`);
      const token = stepIndex(job, /--query properties\.apiKey/);
      assert.ok(token !== -1 && token < deploy, `${workflow} ${id}`);
      const script = steps(job)[token].run;
      assert.ok(
        script.indexOf('::add-mask::$token') < script.indexOf('GITHUB_OUTPUT'),
        `${workflow} ${id}`,
      );
      const login = steps(job).findIndex((step) => step.uses?.startsWith('azure/login@'));
      assert.ok(login !== -1 && login < token, `${workflow} ${id}`);
      const { with: input } = steps(job)[deploy];
      assert.equal(
        input.azure_static_web_apps_api_token,
        `\${{ steps.${steps(job)[token].id}.outputs.token }}`,
      );
      assert.equal(input.skip_app_build, true);
      assert.equal(input.app_location, 'dist');
      assert.equal(input.action, 'upload');
    }
    assert.equal(deploys, 3, 'preview, release, redeploy');
  });
});

describe('preview.yml (Task 7)', () => {
  const preview = byFile('preview.yml');
  const jobs = jobsOf('preview.yml');

  test('AC-069, AC-071: runs only by hand (changed 22.11.2026), never on a push or pull request', () => {
    assert.deepEqual(Object.keys(preview.doc.on), ['workflow_dispatch']);
  });

  test('AC-069: a run by hand from another branch than develop stops before anything is delivered', () => {
    // The environment "preview" only allows develop as well; this stops earlier and visibly.
    assert.equal(jobs.checks.if, "github.ref == 'refs/heads/develop'");
  });

  test('AC-069: one run at a time, a waiting run is replaced by a newer push', () => {
    assert.deepEqual(preview.doc.concurrency, { group: 'preview', 'cancel-in-progress': false });
  });

  test('AC-070: the checks come first, everything else needs them', () => {
    assert.equal(jobs.checks.uses, './.github/workflows/checks.yml');
    assert.deepEqual(jobs.checks.permissions, { contents: 'read', 'pull-requests': 'read' });
    for (const [id, job] of Object.entries(jobs)) {
      if (id !== 'checks') assert.ok(needsOf(job).includes('checks'), id);
    }
  });

  test('AC-070: build → Supabase → web → verification, in this order', () => {
    assert.deepEqual(Object.keys(jobs), [
      'checks',
      'web-bauen',
      'supabase-vorschau',
      'web-vorschau',
      'pruefen',
    ]);
    assert.ok(needsOf(jobs['supabase-vorschau']).includes('web-bauen'));
    assert.ok(needsOf(jobs['web-vorschau']).includes('supabase-vorschau'));
    assert.ok(needsOf(jobs.pruefen).includes('web-vorschau'));
  });

  test('decision 3: the build has no environment and only public preview values', () => {
    const build = jobs['web-bauen'];
    assert.equal(build.environment, undefined);
    assert.equal(build.env.EXPO_PUBLIC_SUPABASE_URL, '${{ vars.PREVIEW_SUPABASE_URL }}');
    assert.equal(
      build.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      '${{ vars.PREVIEW_SUPABASE_PUBLISHABLE_KEY }}',
    );
    assert.equal(build.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY, '${{ vars.PREVIEW_VAPID_PUBLIC_KEY }}');
    assert.equal(build.env.EXPO_PUBLIC_APP_VERSION, 'vorschau');
    assert.equal(build.env.EXPO_PUBLIC_DEV_LOGIN, undefined);
    assert.ok(stepIndex(build, /pnpm build:web/) !== -1);
  });

  test('AC-071: every job that touches the preview uses the environment preview', () => {
    for (const id of ['supabase-vorschau', 'web-vorschau', 'pruefen'])
      assert.equal(envName(jobs[id]), 'preview', id);
  });

  test('AC-017, AC-014: status, config, reset without seed, preview seed, invitations, then config, functions, secrets', () => {
    const job = jobs['supabase-vorschau'];
    assertOrder(
      job,
      [
        /^node scripts\/ci\/supabase-status\.mjs$/,
        /^node scripts\/ci\/supabase-remote\.mjs preview$/,
        RESET,
        /supabase db query .*--file supabase\/preview-seed\.sql/,
        /^node scripts\/preview-invites\.mjs$/,
        /supabase config push/,
        /supabase functions deploy .*--prune/,
        /supabase secrets set/,
      ],
      'supabase-vorschau',
    );
    const reset = steps(job)[stepIndex(job, RESET)].run;
    assert.match(reset, /--no-seed/);
    assert.match(reset, /--yes/);
  });

  test('AC-014: the invitation addresses reach only the step that needs them', () => {
    const job = jobs['supabase-vorschau'];
    assert.equal(job.env.PREVIEW_INVITE_EMAILS, undefined);
    const invites = steps(job)[stepIndex(job, /preview-invites\.mjs/)];
    assert.equal(invites.env.PREVIEW_INVITE_EMAILS, '${{ secrets.PREVIEW_INVITE_EMAILS }}');
    assert.equal((preview.text.match(/PREVIEW_INVITE_EMAILS }}/g) ?? []).length, 1);
  });

  test('decision 8: the preview sets only ALLOWED_ORIGINS and VAPID_SUBJECT, no push keys or AI values', () => {
    const job = jobs['supabase-vorschau'];
    assert.equal(
      steps(job)[stepIndex(job, /supabase secrets set/)].run,
      `supabase secrets set ${REMOTE_REF} --yes "ALLOWED_ORIGINS=$PREVIEW_WEB_ORIGIN" "VAPID_SUBJECT=$PREVIEW_WEB_ORIGIN"`,
    );
    assert.doesNotMatch(JSON.stringify(preview.doc), /FOUNDRY_|VAPID_PRIVATE|PUSH_SEND_SECRET/);
  });

  test('AC-013: before it reads its own token, the web job proves it cannot read the production one', () => {
    const job = jobs['web-vorschau'];
    const check = stepIndex(job, /secrets list -n "\$PRODUCTION_SWA_NAME"/);
    assert.ok(check !== -1 && check < stepIndex(job, /--query properties\.apiKey/));
    const script = steps(job)[check].run;
    assert.match(script, /> \/dev\/null/, 'a token must never reach the log');
    assert.match(script, /AuthorizationFailed/);
    assert.equal(job.env.PRODUCTION_SWA_NAME, 'swa-housekeeping-app-prd');
  });

  test('AC-013, AC-069: the verification checks the preview and the commit of develop', () => {
    const run = runs(jobs.pruefen).join('\n');
    assert.match(
      run,
      /node scripts\/release\/verify\.mjs "\$PREVIEW_WEB_ORIGIN" "\$PREVIEW_SUPABASE_URL" --environment preview --version vorschau --commit "\$GITHUB_SHA"/,
    );
    assert.equal(
      jobs.pruefen.env.SUPABASE_PUBLISHABLE_KEY,
      '${{ vars.PREVIEW_SUPABASE_PUBLISHABLE_KEY }}',
    );
  });
});

describe('release.yml (Task 8)', () => {
  const release = byFile('release.yml');
  const jobs = jobsOf('release.yml');
  const PRODUCTION_JOBS = [
    'supabase-pruefen',
    'pakete-pruefen',
    'supabase-ausliefern',
    'web-ausliefern',
    'pruefen',
  ];

  test('runs on main, and by hand with the input erzwingen (default off)', () => {
    assert.deepEqual(Object.keys(release.doc.on).sort(), ['push', 'workflow_dispatch']);
    assert.deepEqual(release.doc.on.push.branches, ['main']);
    assert.deepEqual(release.doc.on.workflow_dispatch.inputs.erzwingen, {
      description: release.doc.on.workflow_dispatch.inputs.erzwingen.description,
      type: 'boolean',
      default: false,
    });
  });

  test('AC-032: one delivery at a time, never cancelled', () => {
    assert.deepEqual(release.doc.concurrency, { group: 'release', 'cancel-in-progress': false });
  });

  test('AC-028: the checks come first, everything else needs them', () => {
    assert.equal(jobs.checks.uses, './.github/workflows/checks.yml');
    assert.deepEqual(jobs.checks.permissions, { contents: 'read', 'pull-requests': 'read' });
    for (const [id, job] of Object.entries(jobs)) {
      if (id !== 'checks') assert.ok(needsOf(job).includes('checks'), id);
    }
  });

  test('AC-020, AC-026: version first; without a release nothing is built; --force only from the input', () => {
    assert.ok(needsOf(jobs.version).includes('checks'));
    for (const id of ['web-bauen', 'supabase-pruefen']) {
      assert.equal(jobs[id].if, "needs.version.outputs.release == 'true'", id);
    }
    for (const [id, job] of Object.entries(jobs)) {
      if (!['checks', 'version'].includes(id)) assert.ok(needsOf(job).includes('version'), id);
    }
    const step = steps(jobs.version)[stepIndex(jobs.version, /scripts\/release\/version\.mjs/)];
    assert.equal(
      step.env.FORCE,
      "${{ github.event_name == 'workflow_dispatch' && inputs.erzwingen }}",
    );
    assert.match(step.run, /if \[ "\$FORCE" = true \]; then args\+=\(--force\); fi/);
    assert.equal(jobs.version.outputs.release, '${{ steps.version.outputs.release }}');
  });

  test('AC-027: "Web bauen" and "Supabase prüfen" run side by side', () => {
    assert.deepEqual(needsOf(jobs['web-bauen']).sort(), ['checks', 'version']);
    assert.deepEqual(needsOf(jobs['supabase-pruefen']).sort(), ['checks', 'version']);
    assert.equal(jobs['web-bauen'].name, 'Web bauen');
    assert.equal(jobs['supabase-pruefen'].name, 'Supabase prüfen');
  });

  test('AC-027, AC-029, AC-061: Supabase is delivered only after build, guard, package scan and backup', () => {
    assert.ok(needsOf(jobs['pakete-pruefen']).includes('web-bauen'));
    assert.ok(needsOf(jobs['pakete-pruefen']).includes('supabase-pruefen'));
    assert.equal(jobs.sicherung.uses, './.github/workflows/backup.yml');
    assert.deepEqual(jobs.sicherung.permissions, { contents: 'read', 'id-token': 'write' });
    assert.equal(jobs.sicherung.with.prefix, 'release/v${{ needs.version.outputs.version }}');
    // A called workflow sees the secrets of its environment only with `secrets: inherit`; without
    // it BACKUP_DB_URL was empty in the first release ("BACKUP_DB_URL ohne Passwort").
    assert.equal(jobs.sicherung.secrets, 'inherit');
    assert.ok(needsOf(jobs.sicherung).includes('pakete-pruefen'));
    for (const id of ['web-bauen', 'supabase-pruefen', 'pakete-pruefen', 'sicherung']) {
      assert.ok(needsOf(jobs['supabase-ausliefern']).includes(id), id);
    }
  });

  test('AC-031, AC-064: web after Supabase, verification after web, tag and release after verification', () => {
    assert.ok(needsOf(jobs['web-ausliefern']).includes('supabase-ausliefern'));
    assert.ok(needsOf(jobs.pruefen).includes('web-ausliefern'));
    assert.ok(needsOf(jobs.veroeffentlichen).includes('pruefen'));
    assert.equal(
      jobs['web-ausliefern'].name,
      'Web ausliefern v${{ needs.version.outputs.version }}',
    );
    assert.deepEqual(jobs['web-ausliefern'].environment, {
      name: 'production',
      url: '${{ vars.PRODUCTION_WEB_ORIGIN }}',
    });
  });

  test('AC-058: the jobs that touch production use the environment production, the others none', () => {
    for (const [id, job] of Object.entries(jobs)) {
      if (id === 'checks' || id === 'sicherung') continue;
      assert.equal(envName(job), PRODUCTION_JOBS.includes(id) ? 'production' : undefined, id);
    }
  });

  test('only the release and the hand-back may write to the repository', () => {
    for (const [id, job] of Object.entries(jobs)) {
      const writes = job.permissions?.contents === 'write';
      assert.equal(writes, ['veroeffentlichen', 'rueckfuehrung'].includes(id), id);
    }
  });

  test('AC-027: the build is the production build of this version, packed for the GitHub release', () => {
    const build = jobs['web-bauen'];
    assert.equal(build.env.EXPO_PUBLIC_SUPABASE_URL, '${{ vars.PRODUCTION_SUPABASE_URL }}');
    assert.equal(build.env.EXPO_PUBLIC_APP_VERSION, '${{ needs.version.outputs.version }}');
    assert.equal(build.env.EXPO_PUBLIC_DEV_LOGIN, undefined);
    assert.match(runs(build).join('\n'), /zip -qr "\$RUNNER_TEMP\/web-\$VERSION\.zip"/);
  });

  test('guard: history of production checked, pending migrations listed, nothing applied', () => {
    const job = jobs['supabase-pruefen'];
    assertOrder(
      job,
      [
        /supabase migration list .*--output-format json/,
        /supabase db push .*--dry-run --skip-vault/,
      ],
      'supabase-pruefen',
    );
    assert.match(
      runs(job).join('\n'),
      /node scripts\/release\/supabase-guard\.mjs "\$RUNNER_TEMP\/migrations\.json"/,
    );
    const checkout = steps(job).find((step) => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with['fetch-depth'], 0);
  });

  test('AC-061: the package scan looks for the names and values of the production secrets', () => {
    const step = steps(jobs['pakete-pruefen'])[
      stepIndex(jobs['pakete-pruefen'], /check-web-export\.mjs --scan/)
    ];
    assert.match(step.run, /--names SUPABASE_ACCESS_TOKEN,GOOGLE_CLIENT_SECRET$/);
    assert.equal(step.env.SUPABASE_ACCESS_TOKEN, '${{ secrets.SUPABASE_ACCESS_TOKEN }}');
    assert.equal(step.env.GOOGLE_CLIENT_SECRET, '${{ secrets.GOOGLE_CLIENT_SECRET }}');
  });

  test('AC-027, AC-040, AC-044, AC-045: migrations, then config, functions with prune, only ALLOWED_ORIGINS', () => {
    const job = jobs['supabase-ausliefern'];
    assertOrder(
      job,
      [
        /^node scripts\/ci\/supabase-remote\.mjs production$/,
        /^supabase db push .*--skip-vault --yes$/,
        /^supabase config push/,
        /^supabase functions deploy .*--prune --yes$/,
        /^supabase secrets set/,
      ],
      'supabase-ausliefern',
    );
    assert.doesNotMatch(runs(job).join('\n'), /--dry-run|--include-seed|--include-all/);
    assert.equal(
      steps(job)[stepIndex(job, /supabase secrets set/)].run,
      `supabase secrets set ${REMOTE_REF} --yes "ALLOWED_ORIGINS=$PRODUCTION_WEB_ORIGIN" "VAPID_SUBJECT=$PRODUCTION_WEB_ORIGIN"`,
    );
    assert.doesNotMatch(JSON.stringify(release.doc), /FOUNDRY_|VAPID_PRIVATE|PUSH_SEND_SECRET/);
  });

  test('AC-064: verification with the version and the commit, then the tag with the change list and the package', () => {
    assert.match(
      runs(jobs.pruefen).join('\n'),
      /verify\.mjs "\$PRODUCTION_WEB_ORIGIN" "\$PRODUCTION_SUPABASE_URL" --environment production --version "\$VERSION" --commit "\$GITHUB_SHA"/,
    );
    const publish = runs(jobs.veroeffentlichen).join('\n');
    assert.match(publish, /gh release create "\$TAG" "\$RUNNER_TEMP\/release\/web-\$VERSION\.zip"/);
    assert.match(publish, /--target "\$GITHUB_SHA"/);
    assert.match(publish, /--notes-file "\$RUNNER_TEMP\/release\/changelog\.md"/);
  });

  test('AC-067, AC-072: the hand-back runs only after a released hotfix pushed to main', () => {
    const job = jobs.rueckfuehrung;
    assert.equal(job.if, "github.event_name == 'push' && needs.version.outputs.hotfix == 'true'");
    assert.ok(needsOf(job).includes('veroeffentlichen'));
    assert.deepEqual(job.permissions, {
      contents: 'write',
      'pull-requests': 'write',
      actions: 'write',
    });
    const detect = steps(jobs.version).find((step) => /hand-back\.mjs detect/.test(step.run ?? ''));
    assert.match(detect.if, /github\.event_name == 'push'/);
    assert.equal(jobs.version.outputs.hotfix, '${{ steps.handback.outputs.hotfix }}');
  });

  test('AC-067: branch from main, PR to develop with the agreed title, checks started by hand', async () => {
    const { HAND_BACK_TITLE } = await import('../release/hand-back.mjs');
    const job = jobs.rueckfuehrung;
    assert.equal(job.env.TITLE, HAND_BACK_TITLE);
    assert.equal(job.env.BRANCH, '${{ needs.version.outputs.hand_back_branch }}');
    const script = runs(job).join('\n');
    assert.match(script, /-f ref="refs\/heads\/\$BRANCH" -f sha="\$GITHUB_SHA"/);
    assert.match(script, /-f head="\$BRANCH" -f base=develop/);
    assertOrder(
      job,
      [
        /--json mergeable/,
        /gh workflow run checks\.yml --ref "\$BRANCH"/,
        /gh pr merge "\$NUMBER" --merge/,
      ],
      'rueckfuehrung',
    );
    assert.match(script, /gh run watch "\$id" --exit-status/);
    assert.match(script, /gh workflow run preview\.yml --ref develop/);
  });

  test('AC-068: a conflict leaves the PR open and the job red; never squash, rebase, admin or force', () => {
    const job = jobs.rueckfuehrung;
    const conflict = steps(job)[stepIndex(job, /--json mergeable/)].run;
    assert.match(conflict, /if \[ "\$state" = CONFLICTING \]; then[\s\S]*?exit 1/);
    const script = runs(job).join('\n');
    assert.doesNotMatch(script, /--squash|--rebase|--admin|--auto|\bgit push\b|--force|-X PATCH/);
    assert.equal((script.match(/gh pr merge/g) ?? []).length, 1);
  });
});

describe('redeploy-web.yml (Task 8)', () => {
  const redeploy = byFile('redeploy-web.yml');
  const jobs = jobsOf('redeploy-web.yml');

  test('AC-033: only by hand, with the tag as input, never next to a release', () => {
    assert.deepEqual(Object.keys(redeploy.doc.on), ['workflow_dispatch']);
    assert.equal(redeploy.doc.on.workflow_dispatch.inputs.tag.required, true);
    assert.deepEqual(redeploy.doc.concurrency, { group: 'release', 'cancel-in-progress': false });
  });

  test('AC-033: the tag is checked against the minimum version of production before anything is delivered', () => {
    const check = steps(jobs.version)[stepIndex(jobs.version, /version\.mjs --redeploy/)];
    assert.equal(
      check.run,
      'node scripts/release/version.mjs --redeploy "$TAG" --supabase-url "$PRODUCTION_SUPABASE_URL"',
    );
    assert.equal(check.env.TAG, '${{ inputs.tag }}');
    assert.equal(jobs.version.environment, undefined);
    assert.ok(needsOf(jobs['web-ausliefern']).includes('version'));
    assert.ok(needsOf(jobs.pruefen).includes('web-ausliefern'));
  });

  test('AC-033: the package of that release is delivered, and it must carry that version', () => {
    const script = runs(jobs['web-ausliefern']).join('\n');
    assert.match(script, /gh release download "\$TAG" --pattern "web-\$VERSION\.zip"/);
    assert.match(script, /jq -r \.version dist\/version\.json/);
  });

  test('AC-033: Supabase stays unchanged', () => {
    assert.doesNotMatch(
      redeploy.text,
      /supabase (db (push|query)|config push|functions deploy|secrets set|migration)/,
    );
    assert.doesNotMatch(redeploy.text, RESET);
    assert.match(
      runs(jobs.pruefen).join('\n'),
      /verify\.mjs "\$PRODUCTION_WEB_ORIGIN" "\$PRODUCTION_SUPABASE_URL" --environment production --version "\$VERSION" --commit "\$COMMIT"/,
    );
  });
});

test('workflow files parse as YAML', () => {
  for (const { file, doc } of workflows) assert.equal(typeof doc, 'object', file);
  assert.ok(existsSync(path.join(root, '.github/dependabot.yml')));
});

describe('spec 0027, AC-043: every delivery checks the old address once its variable is set', () => {
  for (const [file, variable] of [
    ['release.yml', 'PRODUCTION_OLD_WEB_ORIGIN'],
    ['redeploy-web.yml', 'PRODUCTION_OLD_WEB_ORIGIN'],
    ['preview.yml', 'PREVIEW_OLD_WEB_ORIGIN'],
  ]) {
    test(`${file} passes --old-origin from the variable ${variable} only when it is set`, () => {
      const jobs = Object.values(byFile(file).doc.jobs);
      const verifying = jobs.filter((job) =>
        runs(job).some((run) => run.includes('scripts/release/verify.mjs')),
      );
      assert.ok(verifying.length > 0);
      for (const job of verifying) {
        const flag = '${' + variable + ':+--old-origin "$' + variable + '"}';
        assert.ok(runs(job).some((run) => run.includes(flag)));
        assert.equal(job.env[variable], `\${{ vars.${variable} }}`);
      }
    });
  }
});
