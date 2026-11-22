// Structure of the backup workflows and the Azure templates (spec 0014, Task 9). Workflows cannot
// run locally; this test, scripts/ci/workflows.test.mjs (rules for every workflow: pins,
// permissions, no package install with an environment, no set -x) and actionlint are their gate.
// The real runs follow in Tasks 13 and 14.
//
//   node --test scripts/backup/workflows.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const workflow = (file) => {
  const text = read(`.github/workflows/${file}`);
  return { text, doc: parse(text) };
};
const json = (file) => JSON.parse(read(`infra/azure/${file}`));

const onlyJob = (doc) => {
  const jobs = Object.values(doc.jobs ?? {});
  assert.equal(jobs.length, 1, 'genau ein Job');
  return jobs[0];
};
const steps = (job) => job.steps ?? [];
/** The shell commands of a job, with backslash continuations joined into one line. */
const commands = (job) =>
  steps(job)
    .map((step) => step.run ?? '')
    .join('\n')
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
const secretsOf = (text) => [...new Set([...text.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))];

const OIDC_PERMISSIONS = { contents: 'read', 'id-token': 'write' };

function assertAzureLogin(job) {
  const login = steps(job).find((step) => step.uses?.startsWith('azure/login@'));
  assert.ok(login, 'azure/login');
  assert.equal(login.with['client-id'], '${{ vars.AZURE_CLIENT_ID }}');
  assert.equal(login.with['tenant-id'], '${{ vars.AZURE_TENANT_ID }}');
  // The identities only hold data roles on the container, no role on the subscription.
  assert.equal(login.with['allow-no-subscriptions'], true);
}

function assertNoArtifacts(job, text) {
  for (const step of steps(job)) {
    assert.doesNotMatch(step.uses ?? '', /^actions\/(upload-artifact|cache)@/, step.name);
  }
  assert.doesNotMatch(text, /upload-artifact|actions\/cache/);
}

function assertCleanup(job) {
  const last = steps(job).at(-1);
  assert.equal(last.if, 'always()', 'der letzte Schritt räumt immer auf');
  assert.match(last.run, /rm -rf/);
}

describe('backup.yml', () => {
  const { text, doc } = workflow('backup.yml');
  const job = onlyJob(doc);
  const cmds = commands(job);

  test('runs by hand and when called (schedule.yml, release.yml), never on its own', () => {
    assert.deepEqual(Object.keys(doc.on).sort(), ['workflow_call', 'workflow_dispatch']);
    for (const trigger of ['workflow_call', 'workflow_dispatch']) {
      const prefix = doc.on[trigger].inputs.prefix;
      assert.equal(prefix.type, 'string', trigger);
      assert.equal(prefix.required, false, trigger);
      assert.equal(prefix.default, '', trigger);
    }
  });

  test('AC-053: environment backup, OIDC to Azure, only the three backup secrets', () => {
    assert.equal(job.environment, 'backup');
    assert.deepEqual(job.permissions, OIDC_PERMISSIONS);
    assertAzureLogin(job);
    assert.deepEqual(secretsOf(text).sort(), [
      'BACKUP_DB_URL',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_SECRET_ACCESS_KEY',
    ]);
  });

  test('the password of BACKUP_DB_URL is masked before the first dump', () => {
    const mask = cmds.findIndex((c) => c.includes('::add-mask::'));
    const dump = cmds.findIndex((c) => c.includes('supabase db dump'));
    assert.ok(mask >= 0 && mask < dump, 'add-mask vor dem Dump');
  });

  test('AC-057: the CLI only writes its dump script; it runs as backup_reader, without SET ROLE', () => {
    const cli = cmds.filter((c) => /\bsupabase db dump\b/.test(c));
    assert.equal(cli.length, 1);
    assert.match(
      cli[0],
      /supabase db dump --dry-run --remote="\$BACKUP_DB_URL" "\$@" > "\$W\/dump\.sh"/,
    );
    assert.doesNotMatch(cli[0], /--linked|--db-url|--debug/);
    const strip = cmds.findIndex((c) => c.startsWith('sed -i -E'));
    assert.match(cmds[strip], /--role "postgres"/);
    const run = cmds.findIndex((c) => /^docker run /.test(c));
    assert.ok(strip >= 0 && run > strip, 'Rolle entfernt, bevor das Skript läuft');
    assert.match(cmds[run], /docker run --rm -i --entrypoint bash "\$PG_IMAGE" < "\$W\/dump\.sh"/);
    const step = steps(job).find((s) => s.env?.PG_IMAGE);
    assert.match(
      step.env.PG_IMAGE,
      /^public\.ecr\.aws\/supabase\/postgres:17[\d.]+@sha256:[0-9a-f]{64}$/,
    );
    assert.ok(
      cmds.some((c) => c === 'rm -f "$W/dump.sh"'),
      'Skript mit Zugangsdaten gelöscht',
    );
  });

  test('AC-052: roles, schema and data are dumped, data with COPY', () => {
    const dumps = cmds.filter((c) => /^if ! dump /.test(c));
    assert.deepEqual(dumps, [
      'if ! dump roles.sql --role-only; then',
      'if ! dump schema.sql; then',
      // Restoring storage.buckets_vectors and storage.vector_indexes as postgres is refused.
      'if ! dump data.sql --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes; then',
    ]);
  });

  test('AC-055: an unreachable database fails with „Datenbank nicht erreichbar“', () => {
    assert.match(text, /::error::Datenbank nicht erreichbar/);
  });

  test('AC-052: photos only from s3://household-media to the runner, never back', () => {
    const s3 = cmds.filter((c) => /\baws s3\b/.test(c));
    assert.equal(s3.length, 1);
    const [, sub, source, target] = /\baws s3 (\S+) (\S+) (\S+)/.exec(s3[0]);
    assert.equal(sub, 'sync');
    assert.equal(source, 's3://household-media');
    assert.doesNotMatch(target, /^s3:/);
    assert.match(s3[0], /--endpoint-url "\$BACKUP_S3_ENDPOINT"/);
    assert.doesNotMatch(text, /aws s3 (cp|mv|rm|rb|mb)\b/);
  });

  test('a missing photo bucket (before the first release) gives zero photos; other errors fail', () => {
    const step = steps(job).find((s) => s.name === 'Fotos sichern');
    assert.match(step.run, /NoSuchBucket/);
    assert.match(step.run, /::warning::Bucket household-media fehlt/);
    assert.match(step.run, /mkdir -p \.\/media/);
    // Anything else than a missing bucket is printed and ends the step red.
    assert.match(step.run, /exit 1/);
  });

  test('AC-052: one archive, encrypted with age to the public key, then the manifest', () => {
    const tar = cmds.findIndex((c) => /\btar -cz/.test(c));
    assert.ok(tar >= 0);
    assert.match(cmds[tar], /\| age -r "\$BACKUP_AGE_RECIPIENT" -o /, 'tar direkt in age');
    const manifest = cmds.findIndex((c) => c.includes('scripts/backup/manifest.mjs'));
    assert.ok(manifest > tar);
  });

  test('AC-053: uploads only the encrypted archive and the manifest, never overwriting', () => {
    const selfCheck = steps(job).find((step) => step.id === 'selbstpruefung');
    assert.ok(selfCheck, 'Schritt selbstpruefung');
    const uploads = steps(job)
      .filter((step) => step !== selfCheck)
      .flatMap((step) => commands({ steps: [step] }))
      .filter((c) => /\baz storage blob upload\b/.test(c));
    assert.equal(uploads.length, 2);
    for (const upload of uploads) {
      assert.match(upload, /--auth-mode login/);
      assert.match(upload, /--overwrite false/);
      assert.match(upload, /-f "[^"]*(backup\.tar\.gz\.age|manifest\.json)"/);
    }
  });

  test('AC-053: self-check — deleting and overwriting the fresh backup must fail', () => {
    const run = steps(job).find((step) => step.id === 'selbstpruefung').run;
    assert.match(run, /if az storage blob delete [^\n]*;\s*then[\s\S]*?exit 1/);
    assert.match(
      run,
      /if az storage blob upload [^\n]*--overwrite true[^\n]*;\s*then[\s\S]*?exit 1/,
    );
  });

  test('upload targets come from paths.mjs (daily, monthly, release), nothing else', () => {
    assert.match(text, /node scripts\/backup\/paths\.mjs targets --prefix "\$PREFIX"/);
    assert.match(text, /PREFIX: \$\{\{ inputs\.prefix \}\}/);
  });

  test('nothing is kept as an artifact, the working folder is always removed', () => {
    assertNoArtifacts(job, text);
    assertCleanup(job);
  });
});

describe('restore-test.yml', () => {
  const { text, doc } = workflow('restore-test.yml');
  const job = onlyJob(doc);
  const cmds = commands(job);
  const index = (pattern) => cmds.findIndex((c) => pattern.test(c));

  test('runs by hand (and from schedule.yml) only', () => {
    assert.deepEqual(Object.keys(doc.on), ['workflow_dispatch']);
  });

  test('AC-056: environment restore-test, OIDC to Azure, only the private key', () => {
    assert.equal(job.environment, 'restore-test');
    assert.deepEqual(job.permissions, OIDC_PERMISSIONS);
    assertAzureLogin(job);
    assert.deepEqual(secretsOf(text), ['BACKUP_AGE_IDENTITY']);
  });

  test('reads backups only: no upload, no delete', () => {
    assert.doesNotMatch(text, /az storage blob (upload|delete)/);
  });

  test('AC-056: newest daily backup (36 hours), checksum before decrypting, then restore', () => {
    const latest = index(/node scripts\/backup\/paths\.mjs latest/);
    const download = index(/az storage blob download/);
    const checksum = index(/node scripts\/backup\/compare\.mjs checksum/);
    const decrypt = index(/\bage -d\b/);
    const start = index(/\bsupabase db start\b/);
    const restore = index(/session_replication_role = replica/);
    const counts = index(/node scripts\/backup\/compare\.mjs counts/);
    const order = [latest, download, checksum, decrypt, start, restore, counts];
    assert.ok(
      order.every((i) => i >= 0),
      String(order),
    );
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
    );
  });

  test('AC-056: no psql output reaches the log', () => {
    const psql = cmds.filter((c) => /\bpsql "\$RESTORE_DB"/.test(c));
    assert.ok(psql.length >= 2);
    for (const c of psql) assert.match(c, /\s>\s*("[^"]+"|\/dev\/null)/, c);
    for (const c of psql) assert.match(c, /\s2>\s*"[^"]+"/, c);
  });

  test('the private key is written with mode 0600 and removed after decrypting', () => {
    assert.match(text, /umask 077/);
    assert.match(text, /rm -f "\$KEY"/);
  });

  test('nothing is kept as an artifact, the database and folder are always removed', () => {
    assertNoArtifacts(job, text);
    assertCleanup(job);
    assert.match(steps(job).at(-1).run, /supabase stop --no-backup/);
  });
});

describe('schedule.yml', () => {
  const { doc } = workflow('schedule.yml');
  const jobs = Object.values(doc.jobs);

  test('nightly backup at 02:17 UTC, restore test on the first at 04:47 UTC', () => {
    assert.deepEqual(Object.keys(doc.on), ['schedule']);
    assert.deepEqual(
      doc.on.schedule.map((s) => s.cron),
      ['17 2 * * *', '47 4 1 * *'],
    );
  });

  test('decision 15: starts the workflow on main and fails with it', () => {
    const cases = [
      ['17 2 * * *', 'backup.yml'],
      ['47 4 1 * *', 'restore-test.yml'],
    ];
    assert.equal(jobs.length, cases.length);
    for (const [cron, file] of cases) {
      const job = jobs.find((j) => j.if === `github.event.schedule == '${cron}'`);
      assert.ok(job, cron);
      assert.equal(job.environment, undefined);
      assert.deepEqual(job.permissions, { actions: 'write' });
      const cmds = commands(job).join('\n');
      assert.match(cmds, new RegExp(`gh workflow run ${file.replace('.', '\\.')} --ref main`));
      assert.match(cmds, /gh run watch "\$id" --exit-status/);
      assert.doesNotMatch(cmds, /secrets\./);
    }
  });
});

describe('infra/azure', () => {
  test('AC-053: Backup Writer may only write blobs — no read, no delete', () => {
    const role = json('role-backup-writer.json');
    assert.equal(role.Name, 'Housekeeping Backup Writer');
    assert.equal(role.IsCustom, true);
    assert.deepEqual(role.Actions, []);
    assert.deepEqual(role.DataActions, [
      'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write',
      'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/add/action',
    ]);
    assert.deepEqual(role.NotDataActions, []);
    assert.deepEqual(role.AssignableScopes, ['{{SCOPE}}']);
  });

  test('SWA Deploy Token Reader may only read the site and list its secrets', () => {
    const role = json('role-swa-deploy-token.json');
    assert.equal(role.Name, 'Housekeeping SWA Deploy Token Reader');
    assert.equal(role.IsCustom, true);
    assert.deepEqual(role.Actions, [
      'Microsoft.Web/staticSites/read',
      'Microsoft.Web/staticSites/listSecrets/action',
    ]);
    assert.deepEqual(role.DataActions, []);
    assert.deepEqual(role.AssignableScopes, ['{{SCOPE}}']);
  });

  test('AC-054: daily and release after 31 days, monthly after 366, past the 30-day lock', () => {
    const { rules } = json('backup-lifecycle.json');
    const days = Object.fromEntries(
      rules.flatMap((rule) => {
        assert.equal(rule.enabled, true);
        assert.equal(rule.type, 'Lifecycle');
        assert.deepEqual(Object.keys(rule.definition.actions), ['baseBlob']);
        assert.deepEqual(Object.keys(rule.definition.actions.baseBlob), ['delete']);
        const after = rule.definition.actions.baseBlob.delete.daysAfterModificationGreaterThan;
        return rule.definition.filters.prefixMatch.map((prefix) => [prefix, after]);
      }),
    );
    assert.deepEqual(days, {
      'backups/daily/': 31,
      'backups/release/': 31,
      'backups/monthly/': 366,
    });
  });

  test('AC-063: budget of 10 a month, mail at 80 % and 100 % of the actual costs', () => {
    const { properties } = json('budget.json');
    assert.equal(properties.category, 'Cost');
    assert.equal(properties.amount, 10);
    assert.equal(properties.timeGrain, 'Monthly');
    assert.match(properties.timePeriod.startDate, /^\{\{START\}\}/);
    const notifications = Object.values(properties.notifications);
    assert.deepEqual(
      notifications.map((n) => n.threshold).sort((a, b) => a - b),
      [80, 100],
    );
    for (const n of notifications) {
      assert.equal(n.enabled, true);
      assert.equal(n.thresholdType, 'Actual');
      assert.equal(n.operator, 'GreaterThanOrEqualTo');
      assert.deepEqual(n.contactEmails, ['{{EMAIL}}']);
    }
  });
});
