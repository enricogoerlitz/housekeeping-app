// Tiny static server for the exported web build, with SPA fallback to index.html.
// Usage: node serve.mjs <root> <port>
// GET /__e2e names what it serves (spec 0031, AC-023): the dist path, the SHA-256 of its
// index.html and the server's PID, so the e2e setup adopts only a server of its own export.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '../apps/app/dist');
const port = Number(process.argv[3] ?? 8790);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname === '/__e2e') {
      const index = path.join(root, 'index.html');
      const hash = fs.existsSync(index)
        ? createHash('sha256').update(fs.readFileSync(index)).digest('hex')
        : null;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ dist: root, index: hash, pid: process.pid }));
      return;
    }
    let file = path.join(root, pathname);
    const inside = file === root || file.startsWith(root + path.sep);
    if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html');
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
