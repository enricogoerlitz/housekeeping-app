// Throwaway git repositories under tmp/ (git-ignored) for the tests of scripts/release. Not a test
// file itself: the glob of `pnpm test:scripts` only runs *.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A factory for empty repositories on `main`, removed after the test file. */
export function repositories(name) {
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const dir = mkdtempSync(path.join(root, 'tmp', `${name}-`));
  after(() => rmSync(dir, { recursive: true, force: true }));
  let counter = 0;
  return () => {
    counter += 1;
    const cwd = path.join(dir, `repo-${counter}`);
    mkdirSync(cwd, { recursive: true });
    git(cwd, 'init', '-q', '-b', 'main');
    return cwd;
  };
}

export function git(cwd, ...args) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** Writes `files` ({ path: content }) and commits them with `message`; returns the commit. */
export function commit(cwd, message, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), content);
  }
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '--allow-empty', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

/** Runs a script with Node in `cwd`; stdout and stderr together. */
export function runScript(script, cwd, args, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_OUTPUT: '', ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    output: `${result.stdout}${result.stderr}`,
  };
}
