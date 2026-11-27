// The pipeline's upsert (spec 0066, ADR-0019): `node foundry-agents.cjs --env preview|prod --agents
// agents.json` in the job with the environment, after azure/login (OIDC). The agents come as JSON
// from the build job; this entry imports only Node and our own files, so the bundle holds no
// package code (spec 0014, decision 3).
import { appendFileSync, readFileSync } from 'node:fs';

import type { AgentSpec } from './environments';
import { restAgentsApi } from './rest';
import { run } from './run';
import { azureCliToken } from './token';

const args = process.argv.slice(2);
const at = args.indexOf('--agents');
const file = at >= 0 ? args[at + 1] : undefined;

void run(args, {
  env: (name) => process.env[name],
  agents: () => {
    if (!file) throw new Error('--agents <file> fehlt');
    return JSON.parse(readFileSync(file, 'utf8')) as AgentSpec[];
  },
  api: (endpoint) => restAgentsApi(endpoint, azureCliToken(), fetch),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  output: (lines) => {
    const output = process.env.GITHUB_OUTPUT;
    if (output) appendFileSync(output, `${lines.join('\n')}\n`);
  },
}).then((code) => process.exit(code));
