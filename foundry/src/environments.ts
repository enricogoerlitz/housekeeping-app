// The deployments of an agent (spec 0066, ADR-0019): one suffix per environment. No imports, so
// the pipeline's bundle carries no package code.

export const ENVIRONMENTS = ['local', 'preview', 'prod'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** "places-agent" in "preview" is "places-agent-preview". */
export function agentName(base: string, environment: Environment): string {
  return `${base}-${environment}`;
}

/** An agent as the upsert sends it: built from foundry/agents/<name>.yaml (definitions.ts). */
export interface AgentSpec {
  /** The base name, e.g. "places-agent"; deployed with the environment as suffix. */
  name: string;
  description?: string;
  metadata?: Record<string, string>;
  /** The definition as Foundry stores it (snake_case keys, sent unchanged). */
  definition: Record<string, unknown> & { kind: 'prompt'; model: string; instructions: string };
}
