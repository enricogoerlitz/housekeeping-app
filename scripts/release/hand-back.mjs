// Hand-back after a hotfix (spec 0014, Task 8; AC-067, AC-068, AC-072, plan decision 14). No
// dependencies: runs in the job "version" of release.yml.
//
//   GH_TOKEN=… GITHUB_REPOSITORY=<owner>/<repo> GITHUB_SHA=<sha> \
//     node scripts/release/hand-back.mjs detect --version <JJJJ.M.N>
//
// Asks GitHub for the pull requests of the commit on main (`commits/{sha}/pulls`). The commit is a
// hotfix when it is the merge commit of a merged pull request hotfix/… → main; then the job
// "rueckfuehrung" of release.yml opens the branch chore/rueckfuehrung-v<version> from main with a
// pull request to develop. Outputs (GITHUB_OUTPUT): hotfix (true|false), branch.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { parseAppVersion } from '../../packages/core/src/app-version.ts';

/** Title of the hand-back pull request (spec 0014, AC-067). */
export const HAND_BACK_TITLE = 'chore: main nach develop zurückführen';

/** `{ number }` of the hotfix pull request merged into main by commit `sha`, or undefined. */
export function hotfixPullRequest(prs, sha) {
  const hotfix = prs.find(
    (pr) =>
      Boolean(pr.merged_at) &&
      pr.base?.ref === 'main' &&
      /^hotfix\/[a-z0-9]/.test(pr.head?.ref ?? '') &&
      pr.merge_commit_sha === sha,
  );
  return hotfix ? { number: hotfix.number } : undefined;
}

/** The hand-back branch of a release `version` (JJJJ.M.N). */
export function handBackBranch(version) {
  if (typeof version !== 'string' || !parseAppVersion(version)) {
    throw new Error(`Ungültige Version „${version}“ für die Rückführung`);
  }
  return `chore/rueckfuehrung-v${version}`;
}

function pullsOfCommit(repository, sha) {
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
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { version: { type: 'string' } },
  });
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (positionals[0] !== 'detect' || !repository || !sha) {
    console.error(
      'Usage: GITHUB_REPOSITORY=… GITHUB_SHA=… node scripts/release/hand-back.mjs detect --version <JJJJ.M.N>',
    );
    return 2;
  }
  try {
    const branch = handBackBranch(values.version);
    const hotfix = hotfixPullRequest(pullsOfCommit(repository, sha), sha);
    console.log(
      hotfix
        ? `Hotfix #${hotfix.number}: nach der Veröffentlichung Rückführung über ${branch}.`
        : 'Kein Hotfix: keine Rückführung.',
    );
    const out = process.env.GITHUB_OUTPUT;
    if (out) appendFileSync(out, `hotfix=${hotfix ? 'true' : 'false'}\nbranch=${branch}\n`);
    return 0;
  } catch (error) {
    const message = `Rückführung: ${error.message}`;
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error::${message}`);
    else console.error(`FEHLER: ${message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
