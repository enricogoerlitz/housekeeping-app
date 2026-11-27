#!/usr/bin/env node
// Creates or updates the Foundry agent of the KI-Agent (spec 0066) idempotently: a new version
// only when the definition changed, otherwise it names the version that already has it. Agent
// management needs Entra (role "Azure AI User" on the project); the API key is refused for it.
//
//   export FOUNDRY_PROJECT_ENDPOINT=https://<resource>.services.ai.azure.com/api/projects/<project>
//   node infra/foundry/create-agent.mjs            # token from `az account get-access-token`
//   node infra/foundry/create-agent.mjs --check    # only says whether a new version is needed
//
// Prints nothing secret: neither the token nor the endpoint's key. The version it names goes into
// the function secret FOUNDRY_PLACES_AGENT_VERSION (docs/architecture/betrieb.md).
import { execFileSync } from 'node:child_process';

import { AGENT_NAME, buildDefinition } from './places-agent/definition.mjs';

const check = process.argv.includes('--check');
const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.replace(/\/+$/, '');
if (!endpoint) {
  console.error('FOUNDRY_PROJECT_ENDPOINT is not set.');
  process.exit(2);
}

function token() {
  if (process.env.FOUNDRY_TOKEN) return process.env.FOUNDRY_TOKEN;
  const args = ['account', 'get-access-token', '--resource', 'https://ai.azure.com'];
  if (process.env.FOUNDRY_SUBSCRIPTION)
    args.push('--subscription', process.env.FOUNDRY_SUBSCRIPTION);
  args.push('--query', 'accessToken', '-o', 'tsv');
  try {
    return execFileSync('az', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    console.error('No Entra token: sign in with `az login` (role "Azure AI User" on the project).');
    process.exit(2);
  }
}

const bearer = token();

async function api(method, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { status: response.status, json };
}

// The service reorders keys when it stores a definition: compare key-order independent.
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])]),
        )
      : value;
const canon = (definition) =>
  JSON.stringify(
    sorted({
      model: definition?.model,
      instructions: definition?.instructions,
      tools: definition?.tools,
      reasoning: definition?.reasoning ?? null,
    }),
  );

const wanted = buildDefinition();
const existing = await api('GET', `/agents/${AGENT_NAME}?api-version=v1`);
if (existing.status !== 200 && existing.status !== 404) {
  console.error(
    `Reading the agent failed: HTTP ${existing.status} ${existing.json?.error?.code ?? ''}`,
  );
  process.exit(1);
}

let version;
if (existing.status === 200) {
  const list = await api('GET', `/agents/${AGENT_NAME}/versions?api-version=v1&limit=100`);
  const same = (list.json.data ?? []).find(
    (entry) => canon(entry.definition) === canon(wanted.definition),
  );
  if (same) {
    console.log(`unchanged: ${AGENT_NAME} version ${same.version} has this definition`);
    process.exit(0);
  }
}
if (check) {
  console.log(`${AGENT_NAME}: the definition differs, a new version is needed`);
  process.exit(3);
}
const created =
  existing.status === 404
    ? await api('POST', '/agents?api-version=v1', { name: AGENT_NAME, ...wanted })
    : await api('POST', `/agents/${AGENT_NAME}/versions?api-version=v1`, wanted);
if (created.status >= 300) {
  console.error(`Creating failed: HTTP ${created.status} ${created.json?.error?.code ?? ''}`);
  process.exit(1);
}
version = (created.json.versions?.latest ?? created.json).version;
console.log(`created ${AGENT_NAME} version ${version} (model ${wanted.definition.model})`);
console.log(`Set the function secret FOUNDRY_PLACES_AGENT_VERSION=${version} to use it.`);
