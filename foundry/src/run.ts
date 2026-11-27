// `foundry-agents --env <local|preview|prod> [--check]` (spec 0066, ADR-0019): upserts every agent
// of foundry/agents for one environment. Prints only name, version and status; a failure only its
// HTTP status and error code — never a token, a header or a body. In GitHub Actions it writes
// `<agent>_name` and `<agent>_version` (e.g. household_agent_version) to $GITHUB_OUTPUT.
import { ENVIRONMENTS, type AgentSpec, type Environment } from './environments';
import { upsertAgent, type AgentsApi } from './upsert';

export interface RunDeps {
  env: (name: string) => string | undefined;
  agents: () => AgentSpec[];
  api: (endpoint: string) => AgentsApi;
  log: (line: string) => void;
  error: (line: string) => void;
  /** Appends `key=value` lines to $GITHUB_OUTPUT when it is set. */
  output: (lines: string[]) => void;
}

/** Status and code of an SDK or HTTP error; nothing else of it is ever shown. */
function describe(error: unknown): string {
  const fields = (error ?? {}) as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
    name?: unknown;
  };
  const status = Number(fields.statusCode ?? fields.status);
  const code =
    typeof fields.code === 'string' && /^[\w.-]{1,60}$/.test(fields.code) ? fields.code : '';
  if (Number.isInteger(status) && status > 0) return `HTTP ${status}${code ? ` ${code}` : ''}`;
  if (fields.name === 'CredentialUnavailableError' || fields.name === 'AuthenticationRequiredError')
    return 'keine Azure-Anmeldung';
  return typeof fields.name === 'string' && /^\w{1,60}$/.test(fields.name) ? fields.name : 'Fehler';
}

export async function run(argv: readonly string[], deps: RunDeps): Promise<number> {
  const envIndex = argv.indexOf('--env');
  const environment = envIndex >= 0 ? argv[envIndex + 1] : undefined;
  if (!environment || !(ENVIRONMENTS as readonly string[]).includes(environment)) {
    deps.error(`Aufruf: foundry-agents --env ${ENVIRONMENTS.join('|')} [--check]`);
    return 2;
  }
  const endpoint = deps.env('FOUNDRY_PROJECT_ENDPOINT')?.trim();
  if (!endpoint || !/^https:\/\/[\w.-]+\/api\/projects\/[\w.-]+\/?$/.test(endpoint)) {
    deps.error(
      'FOUNDRY_PROJECT_ENDPOINT fehlt oder ist keine Projekt-Adresse (https://<ressource>.services.ai.azure.com/api/projects/<projekt>) – siehe docs/architecture/betrieb.md, „KI-Agent“.',
    );
    return 2;
  }
  const check = argv.includes('--check');
  const api = deps.api(endpoint.replace(/\/+$/, ''));
  const outputs: string[] = [];
  let failed = false;
  for (const spec of deps.agents()) {
    try {
      const result = await upsertAgent(api, spec, environment as Environment, { check });
      if (check && result.status === 'created') {
        deps.log(`${result.name}: neue Version nötig`);
        failed = true;
        continue;
      }
      deps.log(
        `${result.name} Version ${result.version} (${result.status === 'created' ? 'neu angelegt' : 'unverändert'})`,
      );
      const key = spec.name.replace(/-/g, '_');
      outputs.push(`${key}_name=${result.name}`, `${key}_version=${result.version}`);
    } catch (error) {
      const reason = describe(error);
      const hint =
        reason.startsWith('HTTP 401') ||
        reason.startsWith('HTTP 403') ||
        reason === 'keine Azure-Anmeldung'
          ? ' – Azure-Anmeldung und Rolle „Foundry User“ auf dem Projekt prüfen (docs/architecture/betrieb.md, „KI-Agent“)'
          : '';
      deps.error(`${spec.name}-${environment}: Anlegen scheiterte (${reason})${hint}`);
      failed = true;
    }
  }
  if (outputs.length > 0) deps.output(outputs);
  return failed ? 1 : 0;
}
