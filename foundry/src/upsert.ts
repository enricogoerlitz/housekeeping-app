// Upsert of an agent (spec 0066, ADR-0019): create it if missing, else a new version only when the
// definition changed. Idempotent; reports only name and version.
import { agentName, type AgentSpec, type Environment } from './environments';

/** The part of the Foundry agents API the upsert needs (REST in rest.ts, fakes in tests). */
export interface AgentsApi {
  /** The versions of an agent with their definitions; undefined when the agent does not exist. */
  versions(name: string): Promise<{ version: string; definition: unknown }[] | undefined>;
  /** Creates the agent with this definition, or a new version of it. */
  createVersion(
    name: string,
    definition: AgentSpec['definition'],
    options: { description?: string; metadata?: Record<string, string> },
  ): Promise<{ version: string }>;
}

export interface UpsertResult {
  name: string;
  version: string;
  /** created: a new agent or version; unchanged: the same definition existed already. */
  status: 'created' | 'unchanged';
}

const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
            .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
        )
      : value;

/** What counts for "the same definition": model, instructions, tools, reasoning, text. */
export function definitionKey(definition: unknown): string {
  const d = (definition ?? {}) as Record<string, unknown>;
  return JSON.stringify(
    sorted({
      model: d.model,
      instructions: d.instructions,
      tools: d.tools ?? [],
      reasoning: d.reasoning ?? null,
      text: d.text ?? null,
    }),
  );
}

export async function upsertAgent(
  api: AgentsApi,
  spec: AgentSpec,
  environment: Environment,
  options: { check?: boolean } = {},
): Promise<UpsertResult> {
  const name = agentName(spec.name, environment);
  const wanted = definitionKey(spec.definition);
  const versions = await api.versions(name);
  const same = versions?.find((entry) => definitionKey(entry.definition) === wanted);
  if (same) return { name, version: same.version, status: 'unchanged' };
  if (options.check) return { name, version: '', status: 'created' };
  const created = await api.createVersion(name, spec.definition, {
    ...(spec.description ? { description: spec.description } : {}),
    metadata: { ...spec.metadata, environment },
  });
  return { name, version: created.version, status: 'created' };
}
