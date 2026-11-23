// Spec 0031, AC-023: the e2e setup adopts only a server on its port that serves its own export.
// A server with a foreign dist (another worktree, an old run) stops the setup with its PID.
//
//   node --test e2e/serve.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { serverOnPort } from './global-setup.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = '<!doctype html><title>foreign export</title>';
const foreign = mkdtempSync(path.join(tmpdir(), 'e2e-foreign-'));
const own = mkdtempSync(path.join(tmpdir(), 'e2e-own-'));
writeFileSync(path.join(foreign, 'index.html'), html);
writeFileSync(path.join(own, 'index.html'), '<!doctype html><title>own export</title>');

/** A port nothing listens on right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address());
      probe.close(() => resolve(port));
    });
  });
}

let port = 0;
let server;

before(async () => {
  port = await freePort();
  server = spawn(process.execPath, [path.join(here, 'serve.mjs'), foreign, String(port)], {
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error('serve.mjs did not start');
});

after(() => {
  server?.kill();
  rmSync(foreign, { recursive: true, force: true });
  rmSync(own, { recursive: true, force: true });
});

test('AC-023: /__e2e names the dist path, the hash of index.html and the PID', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/__e2e`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    dist: path.resolve(foreign),
    index: createHash('sha256').update(html).digest('hex'),
    pid: server.pid,
  });
});

test('AC-023: a server with a foreign dist stops the setup and names its PID', async () => {
  await assert.rejects(serverOnPort(port, own), (error) => {
    assert.match(error.message, new RegExp(`PID ${server.pid}\\b`));
    assert.ok(error.message.includes(path.resolve(foreign)), error.message);
    return true;
  });
});

test('AC-023: a server of the own export is adopted', async () => {
  assert.equal(await serverOnPort(port, foreign), 'own');
});

test('AC-023: a free port is reported free', async () => {
  assert.equal(await serverOnPort(await freePort(), own), 'free');
});
