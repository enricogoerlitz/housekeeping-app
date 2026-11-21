// Prepares supabase/config.toml for a job that talks to a cloud project (spec 0014, Task 7; AC-013,
// AC-040, plan decision 6). Run in the job before `config push`, `config diff` (verify.mjs) and
// the other `--remote=<ref>` commands; the changed file is never committed.
//
//   node scripts/ci/supabase-remote.mjs <production|preview> [--file supabase/config.toml]
//
// Spike result (CLI 3.2.0, 21.11.2026): the CLI chooses [remotes.<name>] by its literal
// project_id — an env() there is not resolved for that match ("using base config"), and an unset
// env() in a project_id makes every local command fail ("Invalid config for
// remotes.<name>.project_id"). So the committed sections carry placeholder refs, and this script:
// - checks SUPABASE_PROJECT_REF (the variable of the GitHub environment) against the Supabase
//   address of the same environment (<ENV>_SUPABASE_URL): a production job can never point the
//   preview section at production, nor the other way round (AC-013);
// - checks the web address the section reads with env(): <ENV>_WEB_ORIGIN is https://<host>
//   without path, wildcard or local host, <ENV>_WEB_ORIGIN_WILDCARD is exactly <origin>/**
//   (threat model „Offene Weiterleitung über Platzhalter“); GOOGLE_CLIENT_ID is set;
// - writes the ref into the section of its environment and drops the other cloud section.
// Prints no ref and no address. No dependencies: runs in jobs that install no packages.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Placeholder project_id per cloud section (20 lowercase letters, as the CLI demands). */
export const PLACEHOLDER_REFS = {
  production: 'productionprojectref',
  preview: 'previewprojectrefxxx',
};
const PREFIX = { production: 'PRODUCTION', preview: 'PREVIEW' };
const PROJECT_REF = /^[a-z]{20}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function checkOrigin(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} ist keine Adresse`);
  }
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    url.hostname.includes('*') ||
    LOCAL_HOSTS.has(url.hostname) ||
    url.hostname.endsWith('.localhost')
  ) {
    throw new Error(`${name} muss genau https://<Host> sein (ohne Pfad, Platzhalter, localhost)`);
  }
}

/** The prepared config text; throws with the name of the value that does not fit. */
export function prepareRemoteConfig(
  text,
  { environment, ref, supabaseUrl, webOrigin, webOriginWildcard },
) {
  const placeholder = PLACEHOLDER_REFS[environment];
  if (!placeholder)
    throw new Error(`Unbekannte Umgebung „${environment}“ (production oder preview)`);
  const prefix = PREFIX[environment];
  if (!PROJECT_REF.test(ref ?? '')) {
    throw new Error('SUPABASE_PROJECT_REF fehlt oder ist keine Projekt-Ref (20 Kleinbuchstaben)');
  }
  if ((supabaseUrl ?? '').replace(/\/+$/, '') !== `https://${ref}.supabase.co`) {
    throw new Error(`SUPABASE_PROJECT_REF passt nicht zu ${prefix}_SUPABASE_URL`);
  }
  checkOrigin(`${prefix}_WEB_ORIGIN`, webOrigin ?? '');
  if (webOriginWildcard !== `${webOrigin}/**`) {
    throw new Error(`${prefix}_WEB_ORIGIN_WILDCARD muss genau ${prefix}_WEB_ORIGIN + "/**" sein`);
  }

  const other = Object.keys(PLACEHOLDER_REFS).find((name) => name !== environment);
  const ownHeader = new RegExp(`^\\[remotes\\.${environment}\\]$`);
  const otherHeader = new RegExp(`^\\[remotes\\.${other}(\\.[^\\]]+)?\\]$`);
  const placeholderLine = `project_id = "${placeholder}"`;
  const out = [];
  let section = '';
  let replaced = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) section = trimmed;
    if (otherHeader.test(section)) continue;
    if (ownHeader.test(section) && trimmed === placeholderLine) {
      out.push(line.replace(placeholder, ref));
      replaced += 1;
      continue;
    }
    out.push(line);
  }
  if (replaced !== 1) {
    throw new Error(`[remotes.${environment}] mit dem Platzhalter „${placeholder}“ nicht gefunden`);
  }
  return out.join('\n');
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { file: { type: 'string', default: path.join(root, 'supabase/config.toml') } },
  });
  const environment = positionals[0];
  const prefix = PREFIX[environment];
  const env = (name) => process.env[name]?.trim();
  try {
    if (!prefix || positionals.length !== 1) {
      throw new Error(
        'Usage: node scripts/ci/supabase-remote.mjs <production|preview> [--file <config.toml>]',
      );
    }
    if (!env('GOOGLE_CLIENT_ID')) {
      throw new Error('GOOGLE_CLIENT_ID ist nicht gesetzt (Variable der Umgebung)');
    }
    const text = readFileSync(values.file, 'utf8');
    const prepared = prepareRemoteConfig(text, {
      environment,
      ref: env('SUPABASE_PROJECT_REF'),
      supabaseUrl: env(`${prefix}_SUPABASE_URL`),
      webOrigin: env(`${prefix}_WEB_ORIGIN`),
      webOriginWildcard: env(`${prefix}_WEB_ORIGIN_WILDCARD`),
    });
    writeFileSync(values.file, prepared);
    console.log(`supabase/config.toml: [remotes.${environment}] für dieses Projekt vorbereitet.`);
    return 0;
  } catch (error) {
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error::${error.message}`);
    console.error(`FEHLER: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
