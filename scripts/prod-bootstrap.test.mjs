// scripts/prod-bootstrap.mjs (spec 0014, AC-043, plan Task 10, decision 30): the first sign-in to an
// empty production needs a household and an invitation. The SQL is a pure function of the address;
// the address is checked like the server does and never printed, and the SQL file exists only
// while the CLI runs. A household it creates gets the starter content of the app's
// createHousehold (private.apply_starter with starterPayload from packages/api/src/starter). The idempotence test runs the SQL twice against the local database (inside a
// transaction that is rolled back); without a running local stack it is skipped with a hint.
//
//   node --test scripts/prod-bootstrap.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { tsImport } from 'tsx/esm/api';

import {
  HOUSEHOLD_NAME,
  bootstrapSql,
  parseArgs,
  parseEmail,
  runBootstrap,
} from './prod-bootstrap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'prod-bootstrap-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const EMAIL = 'bootstrap-probe@example.com';

const { starterPayload } = await tsImport(
  '../packages/api/src/starter/payload.ts',
  import.meta.url,
);
const STARTER = starterPayload();

describe('parseEmail', () => {
  test('AC-043: trims and lowercases a valid address (same rule as private.is_valid_email)', () => {
    assert.equal(parseEmail('  Bootstrap-Probe@Example.COM \n'), EMAIL);
  });

  test('AC-043: an invalid address aborts with a message that does not contain it', () => {
    for (const raw of [
      '',
      '   ',
      'kein-at-zeichen',
      'zwei@@example.com',
      'a@b',
      'mit leer@example.com',
    ]) {
      assert.throws(
        () => parseEmail(raw),
        (error) => {
          assert.match(error.message, /Ungültige Google-Adresse/);
          if (raw.trim()) assert.ok(!error.message.includes(raw.trim()), error.message);
          return true;
        },
      );
    }
  });

  test('an address longer than 254 characters is refused', () => {
    assert.throws(() => parseEmail(`${'a'.repeat(250)}@example.com`), /Ungültige Google-Adresse/);
  });
});

describe('bootstrapSql', () => {
  const sql = bootstrapSql(EMAIL);

  test('AC-043: the address appears only hex-encoded, never as SQL text', () => {
    assert.ok(!sql.includes(EMAIL));
    assert.ok(sql.includes(Buffer.from(EMAIL, 'utf8').toString('hex')));
  });

  test('an address with a quote cannot break out of the statement', () => {
    const tricky = "o'brien@example.com";
    const text = bootstrapSql(tricky);
    assert.ok(!text.includes("o'brien"));
    assert.ok(text.includes(Buffer.from(tricky, 'utf8').toString('hex')));
  });

  test('AC-043: household "Enrico & Nadja" with the default meal slots of create_household', () => {
    assert.equal(HOUSEHOLD_NAME, 'Enrico & Nadja');
    assert.ok(sql.includes(`'${HOUSEHOLD_NAME}'`));
    for (const [sort, name] of ['Vormittag', 'Mittag', 'Abend'].entries()) {
      assert.match(
        sql,
        new RegExp(`'id', gen_random_uuid\\(\\), 'name', '${name}', 'sort', ${sort}\\)`),
      );
    }
  });

  test('AC-043: a created household gets the starter payload of createHousehold, hex-encoded', () => {
    const hex = Buffer.from(JSON.stringify(STARTER), 'utf8').toString('hex');
    assert.ok(sql.includes(`convert_from(decode('${hex}', 'hex'), 'UTF8')::jsonb`));
    assert.match(sql, /private\.apply_starter\(created\.id, /);
    assert.match(sql, /from created/);
  });

  test('one statement that reports what it created, never the address', () => {
    assert.match(
      sql,
      /select[\s\S]*as haushalt_angelegt[\s\S]*as einladung_angelegt[\s\S]*as startinhalt_angelegt\s*;\s*$/,
    );
    assert.equal(
      sql
        .trim()
        .split(';')
        .filter((part) => part.trim()).length,
      1,
    );
  });

  test('rejects an address that was not parsed first', () => {
    assert.throws(() => bootstrapSql('Bootstrap-Probe@Example.com'), /parseEmail/);
  });
});

describe('a further household (--household)', () => {
  test('parseArgs: no arguments means "Enrico & Nadja", --household names another one', () => {
    assert.deepEqual(parseArgs([]), { household: HOUSEHOLD_NAME, named: false });
    assert.deepEqual(parseArgs(['--household', '  Teddy & Mauz ']), {
      household: 'Teddy & Mauz',
      named: true,
    });
  });

  test('parseArgs refuses anything else, an empty name and more than 80 characters', () => {
    for (const args of [
      [EMAIL],
      ['--household'],
      ['--household', '   '],
      ['--household', 'x'.repeat(81)],
      ['--household', 'A', 'B'],
    ]) {
      assert.throws(() => parseArgs(args), /Usage|Haushaltsname/);
    }
  });

  test('a named household is found by its name only, quotes cannot break out', () => {
    const text = bootstrapSql(EMAIL, { household: "Teddy's & Mauz", named: true });
    assert.ok(text.includes("'Teddy''s & Mauz'"));
    assert.ok(!text.includes(`'${HOUSEHOLD_NAME}'`));
    assert.doesNotMatch(text, /household_invitations i, input where i\.email = input\.email/);
  });
});

describe('runBootstrap', () => {
  test('the SQL file is private (0600) while the CLI runs and gone afterwards', async () => {
    let seen;
    const status = await runBootstrap({
      email: EMAIL,
      tmpRoot: dir,
      runQuery: (file) => {
        seen = file;
        assert.equal(statSync(file).mode & 0o777, 0o600);
        assert.equal(statSync(path.dirname(file)).mode & 0o777, 0o700);
        assert.equal(readFileSync(file, 'utf8'), bootstrapSql(EMAIL));
        return 0;
      },
    });
    assert.equal(status, 0);
    assert.ok(seen && !existsSync(seen) && !existsSync(path.dirname(seen)));
  });

  test('a failing CLI keeps its exit status, the file is still removed', async () => {
    let seen;
    const status = await runBootstrap({
      email: EMAIL,
      tmpRoot: dir,
      runQuery: (file) => {
        seen = file;
        return 1;
      },
    });
    assert.equal(status, 1);
    assert.ok(!existsSync(seen));
  });

  test('a throwing CLI call still removes the file', async () => {
    let seen;
    await assert.rejects(
      runBootstrap({
        email: EMAIL,
        tmpRoot: dir,
        runQuery: (file) => {
          seen = file;
          throw new Error('spawn failed');
        },
      }),
      /spawn failed/,
    );
    assert.ok(!existsSync(seen));
  });
});

describe('the CLI', () => {
  test('AC-043: an invalid address aborts before any SQL, without the address in the output', () => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/prod-bootstrap.mjs')], {
      input: 'kein-at-zeichen\n',
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Ungültige Google-Adresse/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('kein-at-zeichen'));
  });

  test('arguments are refused: the address is never a command-line argument', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/prod-bootstrap.mjs'), EMAIL],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 2);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(EMAIL));
  });
});

// The local stack of `pnpm exec supabase start`; the seed already has a household named
// "Enrico & Nadja", so the test renames it inside the transaction first.
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'supabase_db_housekeeping-app';
const localDb =
  spawnSync('docker', ['exec', DB_CONTAINER, 'pg_isready', '-q'], { stdio: 'ignore' }).status === 0;

/** Runs SQL as postgres in the local database; returns psql's unaligned output lines. */
function psql(sql) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-At'],
    { input: `\\set ON_ERROR_STOP 1\n${sql}`, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n');
}

const counts = (email) => `
  select count(*) from public.households where name = '${HOUSEHOLD_NAME}';
  select count(*) from public.household_invitations
    where email = '${email}' and household_id in
      (select id from public.households where name = '${HOUSEHOLD_NAME}');
  select jsonb_path_query_array(meal_slots, '$[*].name')::text from public.households
    where name = '${HOUSEHOLD_NAME}';
  select (select count(*) from public.areas a where a.household_id = h.id) || '|' ||
         (select count(*) from public.articles x where x.household_id = h.id) || '|' ||
         (select count(*) from public.articles x where x.household_id = h.id and x.area_id is null)
    from public.households h where name = '${HOUSEHOLD_NAME}';
`;

describe(
  'against the local database',
  { skip: !localDb && 'lokaler Supabase-Stack läuft nicht (pnpm exec supabase start)' },
  () => {
    test('AC-043: first run creates household, invitation and starter content, the second run creates nothing', () => {
      const out = psql(`
      begin;
      update public.households set name = name || ' (Seed)' where name = '${HOUSEHOLD_NAME}';
      ${bootstrapSql(EMAIL)}
      ${bootstrapSql(EMAIL)}
      ${counts(EMAIL)}
      rollback;
    `);
      assert.deepEqual(out, [
        '1|1|1',
        '0|0|0',
        '1',
        '1',
        '["Vormittag", "Mittag", "Abend"]',
        `${STARTER.areas.length}|${STARTER.articles.length}|0`,
      ]);
    });

    test('AC-043: an empty production gets the household with the timezone Europe/Berlin', () => {
      const out = psql(`
      begin;
      update public.households set name = name || ' (Seed)' where name = '${HOUSEHOLD_NAME}';
      ${bootstrapSql(EMAIL)}
      select timezone, (select count(*) from public.household_members m where m.household_id = h.id)
        from public.households h where name = '${HOUSEHOLD_NAME}';
      rollback;
    `);
      assert.deepEqual(out, ['1|1|1', 'Europe/Berlin|0']);
    });

    test('a named further household is created for an address that is already invited elsewhere', () => {
      const other = { household: 'Teddy & Mauz', named: true };
      const out = psql(`
      begin;
      update public.households set name = name || ' (Seed)' where name = '${HOUSEHOLD_NAME}';
      ${bootstrapSql(EMAIL)}
      ${bootstrapSql(EMAIL, other)}
      ${bootstrapSql(EMAIL, other)}
      select count(*) from public.household_invitations where email = '${EMAIL}'
        and household_id in (select id from public.households where name in ('${HOUSEHOLD_NAME}', 'Teddy & Mauz'));
      select (select count(*) from public.articles x where x.household_id = h.id)
        from public.households h where name = 'Teddy & Mauz';
      rollback;
    `);
      assert.deepEqual(out, ['1|1|1', '1|1|1', '0|0|0', '2', `${STARTER.articles.length}`]);
    });

    test('a member of an existing household (renamed in the app) gets neither household nor invitation', () => {
      const member = psql(`
      select p.email from public.profiles p
        join public.household_members m on m.profile_id = p.id
        join public.households h on h.id = m.household_id
        where h.name = '${HOUSEHOLD_NAME}' order by p.email limit 1;
    `)[0];
      assert.ok(member, 'seed member of "Enrico & Nadja"');
      const out = psql(`
      begin;
      update public.households set name = 'Umbenannt' where name = '${HOUSEHOLD_NAME}';
      ${bootstrapSql(member)}
      select count(*) from public.households where name = '${HOUSEHOLD_NAME}';
      rollback;
    `);
      assert.deepEqual(out, ['0|0|0', '0']);
    });
  },
);
