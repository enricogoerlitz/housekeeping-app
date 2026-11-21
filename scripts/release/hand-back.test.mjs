// scripts/release/hand-back.mjs (spec 0014, Task 8; AC-067, AC-068, AC-072, plan decision 14): is
// the commit on main the merge of a hotfix, and the branch and title of the hand-back to develop.
//
//   node --test scripts/release/hand-back.test.mjs
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { checkPullRequest } from '../ci/conventions.mjs';
import { changelogEntry } from './changelog.mjs';
import { HAND_BACK_TITLE, handBackBranch, hotfixPullRequest } from './hand-back.mjs';

const SHA = 'a'.repeat(40);
const pr = (number, head, base, extra = {}) => ({
  number,
  title: 'fix: Liste lädt nicht',
  head: { ref: head },
  base: { ref: base },
  merged_at: '2026-12-20T10:00:00Z',
  merge_commit_sha: SHA,
  ...extra,
});

describe('AC-067, AC-072: hotfix detection', () => {
  test('the merged pull request hotfix/… → main of this commit is a hotfix', () => {
    assert.deepEqual(hotfixPullRequest([pr(45, 'hotfix/liste-laedt-nicht', 'main')], SHA), {
      number: 45,
    });
  });

  test('the release pull request develop → main is no hotfix', () => {
    assert.equal(hotfixPullRequest([pr(44, 'develop', 'main')], SHA), undefined);
  });

  test('a hotfix pull request whose merge commit is another one does not count', () => {
    // commits/{sha}/pulls also lists pull requests that merely contain the commit.
    const other = pr(45, 'hotfix/liste-laedt-nicht', 'main', { merge_commit_sha: 'b'.repeat(40) });
    assert.equal(hotfixPullRequest([other], SHA), undefined);
  });

  test('an open or closed, unmerged hotfix pull request does not count', () => {
    assert.equal(
      hotfixPullRequest([pr(45, 'hotfix/x', 'main', { merged_at: null })], SHA),
      undefined,
    );
  });

  test('a hotfix branch merged into develop does not count', () => {
    assert.equal(hotfixPullRequest([pr(46, 'hotfix/x', 'develop')], SHA), undefined);
  });

  test('no pull request at all (a run started by hand): no hotfix', () => {
    assert.equal(hotfixPullRequest([], SHA), undefined);
  });
});

describe('AC-067: hand-back branch and title', () => {
  test('chore/rueckfuehrung-v<version>', () => {
    assert.equal(handBackBranch('2026.12.5'), 'chore/rueckfuehrung-v2026.12.5');
  });

  test('anything but a version JJJJ.M.N is refused', () => {
    for (const version of ['', 'v2026.12.5', '2026.13.1', '2026.12.5; rm -rf /', '../main']) {
      assert.throws(() => handBackBranch(version), /Version/, version);
    }
  });

  test('the hand-back passes the check "Konventionen" as a pull request to develop', () => {
    assert.deepEqual(
      checkPullRequest({
        title: HAND_BACK_TITLE,
        head: handBackBranch('2026.12.5'),
        base: 'develop',
      }),
      [],
    );
  });

  test('AC-019: the hand-back never shows up in a change list', () => {
    const handBack = {
      number: 47,
      title: HAND_BACK_TITLE,
      head: { ref: handBackBranch('2026.12.5') },
      base: { ref: 'develop' },
      merged_at: '2026-12-20T11:00:00Z',
    };
    assert.equal(changelogEntry(handBack), undefined);
  });
});
