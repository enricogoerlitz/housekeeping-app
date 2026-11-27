// Batch: create every missing picture under docs/recipes/pictures from the front matter of all
// recipe Markdown files (bild, bild_referenz, bild_prompt). Generates fresh images or improves the
// reference photo with FLUX.2-pro. Skips pictures that already exist, so it can be re-run.
//
// Run from the repo root:
//   set -a; . ./.env; set +a; node .claude/skills/recipe-crud/scripts/images.mjs [--limit N] [--only <slug>] [--concurrency 4]
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs/recipes');
const PICS = path.join(DOCS, 'pictures');
const LOG = path.join(ROOT, "tmp/recipe-crud/images-log.jsonl");
mkdirSync(path.dirname(LOG), { recursive: true });
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const LIMIT = Number(opt('--limit', Infinity));
const ONLY = opt('--only', undefined);
const CONCURRENCY = Number(opt('--concurrency', 4));

const STYLE =
  'Professional food photography, natural soft daylight from the side, served on handmade neutral ceramic, ' +
  'rustic light wooden or linen table, shallow depth of field, appetizing, true-to-life colours, ' +
  'square composition with the dish centred, no text, no logos, no hands, no people.';
const EDIT =
  'Turn this home photo into an appetizing professional food photo of the same dish. Keep the dish, its ' +
  'ingredients, portions and plating recognisable. Remove any app overlays, captions, icons, watermarks, faces, ' +
  'hands and clutter. Improve lighting, colour and background. ';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return name === 'pictures' ? [] : walk(p);
    return name.endsWith('.md') && !['README.md', 'UEBERSICHT.md'].includes(name) ? [p] : [];
  });
}

function frontMatter(file) {
  const m = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`no front matter: ${file}`);
  return parse(m[1]);
}

const jobs = [];
for (const file of walk(DOCS)) {
  let fm;
  try {
    fm = frontMatter(file);
  } catch (e) {
    console.error(`SKIP ${path.relative(ROOT, file)}: ${e.message.split('\n')[0]}`);
    continue;
  }
  const out = path.join(DOCS, fm.bild ?? '');
  const slug = path.basename(out, '.jpg');
  if (!fm.bild || !fm.bild_prompt) {
    console.error(`SKIP ${path.relative(ROOT, file)}: bild or bild_prompt missing`);
    continue;
  }
  if (ONLY && slug !== ONLY) continue;
  if (existsSync(out)) continue;
  const ref = fm.bild_referenz ? path.join(ROOT, fm.bild_referenz) : undefined;
  if (ref && !existsSync(ref)) console.error(`WARN ${slug}: reference missing, generating fresh`);
  jobs.push({ slug, out, prompt: fm.bild_prompt.trim(), ref: ref && existsSync(ref) ? ref : undefined });
}
jobs.splice(LIMIT);
console.log(`${jobs.length} images to create`);

mkdirSync(PICS, { recursive: true });
const resource = new URL(process.env.FOUNDRY_OPENAI_BASE_URL).hostname.split('.')[0];
const URL_ = `https://${resource}.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview`;
const tmpDir = path.join(ROOT, 'tmp/recipe-crud/ref-1024');
mkdirSync(tmpDir, { recursive: true });

async function run(job) {
  const body = { model: process.env.FOUNDRY_IMAGE_DEPLOYMENT ?? 'FLUX.2-pro', width: 1024, height: 1024, output_format: 'jpeg' };
  if (job.ref) {
    const small = path.join(tmpDir, `${job.slug}.jpg`);
    execFileSync('sips', ['-Z', '1024', '-s', 'format', 'jpeg', job.ref, '--out', small], { stdio: 'ignore' });
    body.input_image = readFileSync(small).toString('base64');
    body.prompt = `${EDIT}The dish: ${job.prompt} ${STYLE}`;
  } else {
    body.prompt = `${job.prompt} ${STYLE}`;
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res;
    let text;
    try {
      res = await fetch(URL_, {
        method: 'POST',
        headers: { 'api-key': process.env.FOUNDRY_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240_000),
      });
      text = await res.text();
    } catch (error) {
      // Network errors and timeouts are worth another try, like 429 and 5xx.
      console.error(`${job.slug} attempt ${attempt}: ${error.cause?.code ?? error.name}`);
      await new Promise((r) => setTimeout(r, 10000 * attempt));
      continue;
    }
    if (res.ok) {
      const data = JSON.parse(text);
      const raw = `${job.out}.raw.jpg`;
      writeFileSync(raw, Buffer.from(data.data[0].b64_json, 'base64'));
      // Re-encode like the app does for its own photos (JPEG, quality about 0.8).
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', raw, '--out', job.out], { stdio: 'ignore' });
      unlinkSync(raw);
      const entry = { slug: job.slug, edit: Boolean(job.ref), cost_cents: data.request_meta?.cost };
      appendFileSync(LOG, JSON.stringify(entry) + '\n');
      return entry;
    }
    const retry = res.status === 429 || res.status >= 500;
    console.error(`${job.slug} attempt ${attempt}: ${res.status} ${text.slice(0, 200)}`);
    if (!retry) break;
    await new Promise((r) => setTimeout(r, 10000 * attempt));
  }
  appendFileSync(LOG, JSON.stringify({ slug: job.slug, failed: true }) + '\n');
  return { slug: job.slug, failed: true };
}

let next = 0;
let done = 0;
let cents = 0;
let failed = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await run(job);
      done++;
      if (r.failed) failed++;
      else cents += r.cost_cents ?? 0;
      if (done % 10 === 0 || done === jobs.length) console.log(`${done}/${jobs.length} done, ${failed} failed, ${(cents / 100).toFixed(2)} USD`);
    }
  }),
);
console.log(`finished: ${done - failed} ok, ${failed} failed, ${(cents / 100).toFixed(2)} USD`);
