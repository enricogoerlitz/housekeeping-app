// Change list of a release from the titles of its pull requests (spec 0014, Task 6; AC-019,
// AC-072, plan decision 12). No dependencies: runs in the job "version" of release.yml.
//
//   GH_TOKEN=… GITHUB_REPOSITORY=<owner>/<repo> node scripts/release/changelog.mjs --out <file>
//
// For every commit since the latest release tag (all commits before the first one) it asks GitHub
// for the pull requests of that commit (`gh api repos/{repo}/commits/{sha}/pulls`) and keeps the
// merged feature pull requests into develop and hotfix pull requests into main. Release pull
// requests (head develop) and hand-backs after a hotfix (head chore/rueckfuehrung-…) are left out.
// `feat` → „Neu“, `fix` → „Behoben“; docs, refactor, test and chore are not listed. Writes
// Markdown for `gh release create --notes-file`; „Keine sichtbaren Änderungen“ when nothing is
// left.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { git, latestReleaseTag, lines, releaseTags } from './version.mjs';

export const NOTHING_VISIBLE = 'Keine sichtbaren Änderungen';
const SECTIONS = { feat: 'Neu', fix: 'Behoben' };
// The title pattern of the check "Konventionen" (scripts/ci/conventions.mjs).
const TITLE = /^(feat|fix|refactor|test|docs|chore)(?:\([a-z0-9-]+\))?!?: (.+)$/;
const HAND_BACK = /^chore\/rueckfuehrung-/;

/** Whether a merged pull request counts for the change list (plan decision 12). */
function counts(pr) {
  if (!pr.merged_at) return false;
  const head = pr.head?.ref ?? '';
  const base = pr.base?.ref ?? '';
  if (base === 'develop') return head !== 'main' && !HAND_BACK.test(head);
  if (base === 'main') return head.startsWith('hotfix/');
  return false;
}

/** `{ section, text }` of a pull request, or undefined when it is not listed. */
export function changelogEntry(pr) {
  if (!counts(pr)) return undefined;
  const match = TITLE.exec(pr.title.replace(/\s+/g, ' ').trim());
  const section = match && SECTIONS[match[1]];
  if (!section) return undefined;
  const text = match[2].replace(/\s*\(#\d+\)$/, '').trim();
  return { section, text: `${text} (#${pr.number})` };
}

/** The Markdown change list of the pull requests (any order, duplicates allowed). */
export function buildChangelog(prs) {
  const byNumber = new Map(prs.map((pr) => [pr.number, pr]));
  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  const sections = new Map(Object.values(SECTIONS).map((name) => [name, []]));
  for (const number of numbers) {
    const entry = changelogEntry(byNumber.get(number));
    if (entry) sections.get(entry.section).push(entry.text);
  }
  const parts = [...sections]
    .filter(([, entries]) => entries.length > 0)
    .map(([name, entries]) => `## ${name}\n\n${entries.map((text) => `- ${text}`).join('\n')}\n`);
  return parts.length > 0 ? parts.join('\n') : `${NOTHING_VISIBLE}\n`;
}

/** The pull requests of the commits, each once; `lookup(sha)` resolves to an array. */
export async function collectPullRequests(shas, lookup) {
  const byNumber = new Map();
  for (const sha of shas) {
    for (const pr of (await lookup(sha)) ?? []) byNumber.set(pr.number, pr);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/** Commits reachable from HEAD but not from the latest release tag (all before the first). */
export function commitsSinceLastRelease(cwd = process.cwd()) {
  const latest = latestReleaseTag(releaseTags(cwd));
  return lines(git(['rev-list', latest ? `${latest}..HEAD` : 'HEAD'], cwd));
}

function githubPulls(repository) {
  return async (sha) => {
    const result = spawnSync(
      'gh',
      [
        'api',
        '-H',
        'Accept: application/vnd.github+json',
        `repos/${repository}/commits/${sha}/pulls`,
      ],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`gh api commits/${sha}/pulls fehlgeschlagen (Exit ${result.status})`);
    }
    return JSON.parse(result.stdout);
  };
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { out: { type: 'string' } } });
  const repository = process.env.GITHUB_REPOSITORY;
  if (!values.out || !repository) {
    console.error(
      'Usage: GITHUB_REPOSITORY=<owner>/<repo> node scripts/release/changelog.mjs --out <file>',
    );
    return 2;
  }
  try {
    const shas = commitsSinceLastRelease();
    const prs = await collectPullRequests(shas, githubPulls(repository));
    const text = buildChangelog(prs);
    writeFileSync(values.out, text);
    console.log(`Änderungsliste aus ${shas.length} Commit(s) und ${prs.length} PR(s):\n\n${text}`);
    return 0;
  } catch (error) {
    const message = `Änderungsliste: ${error.message}`;
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error::${message}`);
    else console.error(`FEHLER: ${message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
