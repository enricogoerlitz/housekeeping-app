// scripts/release/changelog.mjs (spec 0014, Task 6; AC-019, AC-072, plan decision 12): the change
// list of a release from the titles of its pull requests. Pure functions with fixed pull request
// data, and the commit range against throwaway git repositories under tmp/.
//
//   node --test scripts/release/changelog.test.mjs
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  NOTHING_VISIBLE,
  buildChangelog,
  changelogEntry,
  collectPullRequests,
  commitsSinceLastRelease,
} from './changelog.mjs';
import { commit, git, repositories } from './git-fixture.mjs';

const repo = repositories('release-changelog-test');

const pr = (number, title, head, base, merged = true) => ({
  number,
  title,
  head: { ref: head },
  base: { ref: base },
  merged_at: merged ? '2026-12-10T10:00:00Z' : null,
});

const FEAT_41 = pr(41, 'feat: Reisetaschen packen', 'feat/0012-reisetaschen', 'develop');
const FIX_42 = pr(42, 'fix: Haken springt zurück', 'fix/haken-springt', 'develop');
const DOCS_43 = pr(43, 'docs: Runbook ergänzt', 'docs/runbook', 'develop');
const RELEASE_44 = pr(44, 'chore: Veröffentlichung', 'develop', 'main');
const HOTFIX_45 = pr(45, 'fix: Liste lädt nicht', 'hotfix/liste-laedt-nicht', 'main');
const BACK_46 = pr(
  46,
  'chore: Rückführung v2026.12.5',
  'chore/rueckfuehrung-v2026.12.5',
  'develop',
);

describe('entries', () => {
  test('feat is „Neu“, fix is „Behoben“, the title without type and with the number', () => {
    assert.deepEqual(changelogEntry(FEAT_41), {
      section: 'Neu',
      text: 'Reisetaschen packen (#41)',
    });
    assert.deepEqual(changelogEntry(FIX_42), {
      section: 'Behoben',
      text: 'Haken springt zurück (#42)',
    });
  });

  test('scope and breaking mark are dropped, a number already in the title is not doubled', () => {
    assert.deepEqual(
      changelogEntry(pr(50, 'feat(rezepte)!: Sammlungen (#50)', 'feat/x', 'develop')),
      { section: 'Neu', text: 'Sammlungen (#50)' },
    );
  });

  test('docs, refactor, test and chore are not visible', () => {
    for (const type of ['docs', 'refactor', 'test', 'chore']) {
      assert.equal(changelogEntry(pr(51, `${type}: x`, 'feat/x', 'develop')), undefined, type);
    }
  });

  test('release pull requests, hand-backs and unmerged pull requests are left out', () => {
    assert.equal(changelogEntry(pr(52, 'feat: x', 'develop', 'main')), undefined);
    assert.equal(changelogEntry(BACK_46), undefined);
    assert.equal(changelogEntry(pr(53, 'fix: x', 'chore/rueckfuehrung-v1', 'develop')), undefined);
    assert.equal(changelogEntry(pr(54, 'feat: x', 'feat/x', 'develop', false)), undefined);
    // Only hotfixes reach main besides the release pull request.
    assert.equal(changelogEntry(pr(55, 'fix: x', 'fix/x', 'main')), undefined);
  });

  test('a title is one line', () => {
    assert.deepEqual(changelogEntry(pr(56, 'fix: a\nb', 'fix/x', 'develop')), {
      section: 'Behoben',
      text: 'a b (#56)',
    });
  });
});

describe('change list', () => {
  test('AC-019: #41 under „Neu“, #42 under „Behoben“, neither #43 nor the release pull request #44', () => {
    const text = buildChangelog([RELEASE_44, DOCS_43, FIX_42, FEAT_41, RELEASE_44]);
    assert.equal(
      text,
      '## Neu\n\n- Reisetaschen packen (#41)\n\n## Behoben\n\n- Haken springt zurück (#42)\n',
    );
    assert.doesNotMatch(text, /#43|#44|Runbook|Veröffentlichung/);
  });

  test('AC-072: a hotfix release lists the hotfix under „Behoben“', () => {
    assert.equal(buildChangelog([HOTFIX_45]), '## Behoben\n\n- Liste lädt nicht (#45)\n');
  });

  test('nothing visible', () => {
    assert.equal(buildChangelog([DOCS_43, RELEASE_44]), `${NOTHING_VISIBLE}\n`);
    assert.equal(NOTHING_VISIBLE, 'Keine sichtbaren Änderungen');
  });

  test('each pull request once, even when several of its commits are in the range', async () => {
    const lookup = async (sha) => ({ a: [FEAT_41, RELEASE_44], b: [FEAT_41], c: [] })[sha];
    const prs = await collectPullRequests(['a', 'b', 'c'], lookup);
    assert.deepEqual(
      prs.map((p) => p.number),
      [41, 44],
    );
  });
});

describe('commit range', () => {
  test('AC-072: a hotfix on main lists #45 and not #41, which is only on develop', async () => {
    const cwd = repo();
    commit(cwd, 'feat: Grundlage', { 'a.ts': '1\n' });
    git(cwd, 'tag', 'v2026.12.4');
    git(cwd, 'switch', '-q', '-c', 'develop');
    const feat = commit(cwd, 'feat: Reisetaschen packen (#41)', { 'bag.ts': '1\n' });
    git(cwd, 'switch', '-q', 'main');
    git(cwd, 'switch', '-q', '-c', 'hotfix/liste-laedt-nicht');
    const fix = commit(cwd, 'fix: Liste lädt nicht', { 'list.ts': '1\n' });
    git(cwd, 'switch', '-q', 'main');
    git(cwd, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #45', 'hotfix/liste-laedt-nicht');
    const merge = git(cwd, 'rev-parse', 'HEAD');

    const shas = commitsSinceLastRelease(cwd);
    assert.deepEqual(new Set(shas), new Set([fix, merge]));
    // What GitHub answers for commits/{sha}/pulls.
    const pulls = { [feat]: [FEAT_41], [fix]: [HOTFIX_45], [merge]: [HOTFIX_45] };
    const text = buildChangelog(await collectPullRequests(shas, async (sha) => pulls[sha]));
    assert.equal(text, '## Behoben\n\n- Liste lädt nicht (#45)\n');
  });

  test('AC-019: after the release pull request, the commits of develop since the tag count', () => {
    const cwd = repo();
    commit(cwd, 'feat: Grundlage', { 'a.ts': '1\n' });
    git(cwd, 'tag', 'v2026.12.3');
    git(cwd, 'switch', '-q', '-c', 'develop');
    const feat = commit(cwd, 'feat: Reisetaschen packen (#41)', { 'bag.ts': '1\n' });
    const fix = commit(cwd, 'fix: Haken springt zurück (#42)', { 'check.ts': '1\n' });
    const docs = commit(cwd, 'docs: Runbook ergänzt (#43)', { 'docs/r.md': '1\n' });
    git(cwd, 'switch', '-q', 'main');
    git(cwd, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #44', 'develop');
    const merge = git(cwd, 'rev-parse', 'HEAD');
    assert.deepEqual(new Set(commitsSinceLastRelease(cwd)), new Set([feat, fix, docs, merge]));
  });

  test('the highest version is the last release, not the newest tag', () => {
    const cwd = repo();
    commit(cwd, 'feat: a', { 'a.ts': '1\n' });
    git(cwd, 'tag', 'v2026.12.10');
    const b = commit(cwd, 'feat: b', { 'b.ts': '1\n' });
    git(cwd, 'tag', 'v2026.12.9');
    const c = commit(cwd, 'feat: c', { 'c.ts': '1\n' });
    assert.deepEqual(new Set(commitsSinceLastRelease(cwd)), new Set([b, c]));
  });

  test('before the first release every commit counts', () => {
    const cwd = repo();
    const a = commit(cwd, 'feat: a', { 'a.ts': '1\n' });
    const b = commit(cwd, 'fix: b', { 'b.ts': '1\n' });
    assert.deepEqual(new Set(commitsSinceLastRelease(cwd)), new Set([a, b]));
  });
});
