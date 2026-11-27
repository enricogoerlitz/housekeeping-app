// The agents of foundry/agents/*.yaml (spec 0066, ADR-0019): one file per agent in the keys of
// Foundry's own YAML of an agent version, plus `instructions_file` for instructions kept in Markdown.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

import type { AgentSpec } from './environments';

const AgentFileSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  description: z.string().max(512).optional(),
  metadata: z.record(z.string().max(64), z.string().max(512)).optional(),
  instructions_file: z
    .string()
    .regex(/^[\w.-]+\.md$/)
    .optional(),
  definition: z.looseObject({
    kind: z.literal('prompt'),
    model: z.string().min(1),
    instructions: z.string().optional(),
    tools: z.array(z.looseObject({ type: z.string() })).optional(),
  }),
});

/** One agent file; `readSibling` reads the instructions file next to it. */
export function parseAgentFile(text: string, readSibling: (file: string) => string): AgentSpec {
  const parsed = AgentFileSchema.parse(parse(text));
  const instructions = parsed.instructions_file
    ? readSibling(parsed.instructions_file)
    : parsed.definition.instructions;
  if (!instructions?.trim()) throw new Error(`${parsed.name}: instructions fehlen`);
  return {
    name: parsed.name,
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
    definition: { ...parsed.definition, instructions },
  };
}

/** Every agent of `dir` (*.yaml), sorted by name. */
export function loadAgents(dir: string): AgentSpec[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .map((file) =>
      parseAgentFile(readFileSync(path.join(dir, file), 'utf8'), (sibling) =>
        readFileSync(path.join(dir, sibling), 'utf8'),
      ),
    );
}
