// `pnpm foundry:agents:local` (spec 0066, ADR-0019): the agents of foundry/agents/*.yaml, upserted
// for one environment with the developer's `az login`. `--write <file>` instead writes them as JSON
// for the pipeline (the build job, without an environment), which runs ci.ts on that file.
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadAgents } from './definitions';
import { restAgentsApi } from './rest';
import { run } from './run';
import { azureCliToken } from './token';

const agentsDir = existsSync('foundry/agents')
  ? path.resolve('foundry/agents')
  : path.resolve('agents');
const args = process.argv.slice(2);
const writeAt = args.indexOf('--write');

if (writeAt >= 0) {
  const file = args[writeAt + 1];
  if (!file) throw new Error('--write <file>');
  const agents = loadAgents(agentsDir);
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(file, JSON.stringify(agents));
  console.log(`${file}: ${agents.map((agent) => agent.name).join(', ')}`);
} else {
  void run(args, {
    env: (name) => process.env[name],
    agents: () => loadAgents(agentsDir),
    // FOUNDRY_SUBSCRIPTION: the Foundry resource's subscription, when `az` holds several accounts.
    api: (endpoint) =>
      restAgentsApi(
        endpoint,
        azureCliToken(process.env.FOUNDRY_SUBSCRIPTION?.trim() || undefined),
        fetch,
      ),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
    output: (lines) => {
      const file = process.env.GITHUB_OUTPUT;
      if (file) appendFileSync(file, `${lines.join('\n')}\n`);
    },
  }).then((code) => process.exit(code));
}
