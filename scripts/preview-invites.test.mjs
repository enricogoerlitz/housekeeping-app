// scripts/preview-invites.mjs (spec 0014, Task 7; AC-014, AC-015): invitations of the preview from
// the secret PREVIEW_INVITE_EMAILS. No address may ever reach a log or an error message.
//
//   node --test scripts/preview-invites.test.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { HOUSEHOLD_NAME, invitesSql, parseInviteEmails, runInvites } from './preview-invites.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(root, 'tmp', 'preview-invites-test-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const hex = (text) => Buffer.from(text, 'utf8').toString('hex');

describe('AC-014: the list of the secret', () => {
  test('comma separated, with spaces and line breaks, upper case: trimmed, lowercased, once each', () => {
    assert.deepEqual(
      parseInviteEmails(' Enrico.Person@Gmail.com ,nadja@example.org\n, enrico.person@gmail.com,'),
      ['enrico.person@gmail.com', 'nadja@example.org'],
    );
  });

  test('an invalid address stops everything, and the message names its position, not the value', () => {
    for (const raw of [
      'ok@example.org, kein-at-zeichen',
      'ok@example.org, a@b',
      `${'x'.repeat(250)}@example.org`,
    ]) {
      assert.throws(
        () => parseInviteEmails(raw),
        (error) => {
          assert.match(error.message, /Adresse 2|Adresse 1/);
          for (const part of raw.split(',')) {
            const value = part.trim();
            if (value) assert.ok(!error.message.includes(value), 'no address in the message');
          }
          return true;
        },
      );
    }
  });

  test('an empty or missing secret is an error, not "no invitations"', () => {
    for (const raw of [undefined, '', ' , ']) {
      assert.throws(() => parseInviteEmails(raw), /PREVIEW_INVITE_EMAILS/);
    }
  });
});

describe('AC-014, AC-015: the SQL', () => {
  const sql = invitesSql(['enrico.person@gmail.com', 'nadja@example.org']);

  test('invites into exactly the demo household "Enrico & Nadja", or fails', () => {
    assert.equal(HOUSEHOLD_NAME, 'Enrico & Nadja');
    assert.match(sql, /into strict v_household/);
    assert.match(sql, /from public\.households where name = 'Enrico & Nadja'/);
    assert.match(sql, /insert into public\.household_invitations \(household_id, email\)/);
    assert.match(sql, /on conflict \(household_id, email\) do nothing/);
  });

  test('carries the addresses hex-encoded only', () => {
    assert.ok(!sql.includes('enrico.person@gmail.com'));
    assert.ok(!sql.includes('@'));
    assert.ok(sql.includes(`'${hex('enrico.person@gmail.com')}'`));
    assert.ok(sql.includes(`'${hex('nadja@example.org')}'`));
  });

  test('refuses addresses that did not go through parseInviteEmails', () => {
    assert.throws(() => invitesSql(['Enrico@Gmail.com']), /parseInviteEmails/);
    assert.throws(() => invitesSql([]), /parseInviteEmails/);
  });
});

describe('running the query', () => {
  const ref = 'abcdefghijklmnopqrst';

  test('the SQL lives in a private temp file only while the query runs', async () => {
    let seen;
    const status = await runInvites({
      emails: ['nadja@example.org'],
      ref,
      tmpRoot: tmp,
      runQuery: (args, file) => {
        seen = { args, file, mode: statSync(file).mode & 0o777, text: readFileSync(file, 'utf8') };
        return 0;
      },
    });
    assert.equal(status, 0);
    assert.equal(seen.mode, 0o600);
    assert.ok(seen.text.includes(hex('nadja@example.org')));
    assert.deepEqual(seen.args, ['db', 'query', `--remote=${ref}`, '--yes', '--file', seen.file]);
    assert.equal(existsSync(seen.file), false);
  });

  test('the file is removed after a failure, too, and the status is passed on', async () => {
    let file;
    const status = await runInvites({
      emails: ['nadja@example.org'],
      ref,
      tmpRoot: tmp,
      runQuery: (_args, f) => {
        file = f;
        return 1;
      },
    });
    assert.equal(status, 1);
    assert.equal(existsSync(file), false);
  });

  test('a project ref that is not 20 lowercase letters is refused before anything runs', async () => {
    for (const bad of ['', 'abc', 'ABCDEFGHIJKLMNOPQRST', 'abcdefghijklmnopqrst; ls']) {
      await assert.rejects(
        runInvites({ emails: ['nadja@example.org'], ref: bad, tmpRoot: tmp, runQuery: () => 0 }),
        /SUPABASE_PROJECT_REF/,
      );
    }
  });
});
