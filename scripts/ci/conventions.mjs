// Check "Konventionen" (spec 0014, Task 1; AC-004, AC-010, AC-062, AC-065). No dependencies, so
// the job runs it without installing packages.
//
// - Pull request: title as a conventional commit, branch as <typ>/<slug> (or hotfix/<slug>,
//   dependabot/…, develop as the head of a release PR); to main only from develop or hotfix/….
//   The PR comes from the event (pull_request), from a lookup by branch (workflow_dispatch, e.g.
//   the hand-back after a hotfix), or from --title/--head/--base for a local run. Without one
//   (push) only the files are checked.
// - Files (tracked and untracked, not ignored) in .github/workflows, .github/actions, scripts
//   (without this check and its test) and every package.json: no `supabase db reset` against a
//   remote project (--remote, --linked, --db-url; allowed only in .github/workflows/preview.yml),
//   no `db push --include-seed`, no `migration repair`. A command is matched within one logical
//   line (shell continuations joined), also as an argument list ('db', 'reset', '--linked').
// - Workflows and actions: every `uses:` is pinned to a commit SHA (or a local path, or a docker
//   image by digest).
//
//   node scripts/ci/conventions.mjs [--title <t> --head <branch> --base <branch>]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MESSAGES = {
  title:
    'Titel ohne Typ (feat, fix, refactor, test, docs, chore): erwartet „<typ>: …“ oder „<typ>(<bereich>): …“',
  branch:
    'Zweigname nicht in der Form „<typ>/<slug>“ (Typ: feat, fix, refactor, test, docs, chore; außerdem hotfix/<slug> und dependabot/…)',
  main: 'Nach main nur von develop oder hotfix/…',
};

const TITLE = /^(feat|fix|refactor|test|docs|chore)(\([a-z0-9-]+\))?!?: \S/;
const BRANCH = /^(feat|fix|refactor|test|docs|chore)\/[a-z0-9][a-z0-9._-]*$/;
const HOTFIX = /^hotfix\/[a-z0-9][a-z0-9._-]*$/;

/** Problems of a pull request's title and branches; both are reported together (AC-004). */
export function checkPullRequest({ title, head, base }) {
  const problems = [];
  if (!TITLE.test(title ?? '')) problems.push(MESSAGES.title);
  const validBranch =
    BRANCH.test(head) ||
    HOTFIX.test(head) ||
    head.startsWith('dependabot/') ||
    (head === 'develop' && base === 'main');
  if (!validBranch) problems.push(MESSAGES.branch);
  if (base === 'main' && head !== 'develop' && !HOTFIX.test(head)) problems.push(MESSAGES.main);
  return problems;
}

/**
 * The pull request to check: from the event on pull_request, from `lookup(branch)` on
 * workflow_dispatch, otherwise none.
 */
export function pullRequestFromEvent(eventName, event, branch, lookup) {
  if (eventName === 'pull_request' && event?.pull_request) {
    const pr = event.pull_request;
    return { title: pr.title, head: pr.head.ref, base: pr.base.ref };
  }
  if (eventName === 'workflow_dispatch') return lookup(branch);
  return undefined;
}

// Separators between the words of a command: spaces, or quotes and commas of an argument list.
const SEP = String.raw`['"\x60\s,]+`;
const FORBIDDEN = [
  {
    command: new RegExp(String.raw`\bdb${SEP}reset\b`),
    flags: /--(?:remote|linked|db-url)\b/,
    allowedIn: ['.github/workflows/preview.yml'],
    message:
      'supabase db reset gegen ein entferntes Projekt (--remote, --linked, --db-url) ist nur in .github/workflows/preview.yml erlaubt',
  },
  {
    command: new RegExp(String.raw`\bdb${SEP}push\b`),
    flags: /--include-seed\b/,
    allowedIn: [],
    message:
      'supabase db push --include-seed ist verboten: der Seed kommt nie in ein Cloud-Projekt',
  },
  {
    command: new RegExp(String.raw`\bmigration${SEP}repair\b`),
    flags: /./,
    allowedIn: [],
    message: 'supabase migration repair ist verboten (Runbook B5 in plan.md der Spec 0014)',
  },
];

/** Logical lines with the number of their first physical line; shell continuations are joined. */
function logicalLines(text) {
  const lines = [];
  let current;
  text.split('\n').forEach((line, index) => {
    if (current === undefined) current = { line: index + 1, text: '' };
    if (line.endsWith('\\')) {
      current.text += `${line.slice(0, -1)} `;
      return;
    }
    current.text += line;
    lines.push(current);
    current = undefined;
  });
  if (current) lines.push(current);
  return lines;
}

/** Forbidden Supabase commands (AC-010) in `files` ([{ path, text }]). */
export function findForbiddenCommands(files) {
  const found = [];
  for (const file of files) {
    for (const { line, text } of logicalLines(file.text)) {
      for (const rule of FORBIDDEN) {
        if (rule.allowedIn.includes(file.path)) continue;
        if (rule.command.test(text) && rule.flags.test(text)) {
          found.push({ path: file.path, line, message: rule.message });
        }
      }
    }
  }
  return found;
}

const USES = /^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)/;
const PINNED = [
  /^\.\//,
  /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/,
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/,
];

/** `uses:` entries not pinned to a commit SHA (AC-062) in workflow and action files. */
export function findUnpinnedActions(files) {
  const found = [];
  for (const file of files) {
    file.text.split('\n').forEach((line, index) => {
      const ref = USES.exec(line)?.[1];
      if (ref && !PINNED.some((pattern) => pattern.test(ref))) {
        found.push({
          path: file.path,
          line: index + 1,
          message: `Action nicht per Commit-SHA festgelegt: ${ref}`,
        });
      }
    });
  }
  return found;
}

const isWorkflowFile = (file) =>
  /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file) ||
  /^\.github\/actions\/.+\/action\.ya?ml$/.test(file);
const isScannedForCommands = (file) =>
  (file.startsWith('.github/workflows/') ||
    file.startsWith('.github/actions/') ||
    file.startsWith('scripts/') ||
    path.posix.basename(file) === 'package.json') &&
  !file.startsWith('scripts/ci/conventions');

/** Existing tracked and untracked (not ignored) files of the repository in `cwd`. */
function repositoryFiles(cwd) {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  // A tracked file deleted in the working tree is gone from the change being checked.
  return [...new Set(result.stdout.split('\0').filter(Boolean))]
    .filter((file) => existsSync(path.join(cwd, file)))
    .sort();
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** Open PR for `branch` via the GitHub CLI (workflow_dispatch); undefined when there is none. */
function lookupPullRequest(branch) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) return undefined;
  const owner = repository.split('/')[0];
  const result = spawnSync(
    'gh',
    [
      'api',
      '-X',
      'GET',
      `repos/${repository}/pulls`,
      '-f',
      `head=${owner}:${branch}`,
      '-f',
      'state=open',
      '--jq',
      '[.[] | {title, head: .head.ref, base: .base.ref}] | first',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`gh api pulls failed: ${result.stderr.trim()}`);
  const text = result.stdout.trim();
  return text && text !== 'null' ? JSON.parse(text) : undefined;
}

function main(args) {
  const cwd = process.cwd();
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  const problems = [];

  let pr;
  if (args.includes('--head')) {
    pr = {
      title: argValue(args, '--title') ?? '',
      head: argValue(args, '--head') ?? '',
      base: argValue(args, '--base') ?? '',
    };
  } else {
    const eventName = process.env.GITHUB_EVENT_NAME ?? '';
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const event = eventPath ? JSON.parse(readFileSync(eventPath, 'utf8')) : {};
    pr = pullRequestFromEvent(
      eventName,
      event,
      process.env.GITHUB_REF_NAME ?? '',
      lookupPullRequest,
    );
  }
  if (pr) problems.push(...checkPullRequest(pr).map((message) => ({ message })));
  else console.log('Konventionen: keine PR zu diesem Lauf, Titel und Zweig nicht geprüft.');

  const files = repositoryFiles(cwd);
  const read = (file) => ({ path: file, text: readFileSync(path.join(cwd, file), 'utf8') });
  const commandFiles = files.filter(isScannedForCommands).map(read);
  const workflowFiles = files.filter(isWorkflowFile).map(read);
  problems.push(...findForbiddenCommands(commandFiles), ...findUnpinnedActions(workflowFiles));

  if (problems.length === 0) {
    console.log(
      `Konventionen: ok (${pr ? 'PR-Titel und Zweig, ' : ''}${commandFiles.length} Dateien auf verbotene Befehle, ${workflowFiles.length} Workflows auf SHA-Pins).`,
    );
    return 0;
  }
  for (const { path: file, line, message } of problems) {
    const where = file ? `${file}:${line}: ` : '';
    if (inActions) {
      const location = file ? ` file=${file},line=${line}` : '';
      console.log(`::error${location}::${where}${message}`);
    } else {
      console.error(`FEHLER: ${where}${message}`);
    }
  }
  console.error(`Konventionen: ${problems.length} Problem(e).`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
