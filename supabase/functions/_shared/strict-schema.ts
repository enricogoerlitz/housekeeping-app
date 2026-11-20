import { z } from 'zod';

// Foundry's structured output in strict mode accepts only a subset of JSON Schema: every
// property required, `additionalProperties: false`, no length/format/range keywords, `anyOf`
// instead of `oneOf`. Optional fields therefore become nullable, and the nulls are removed again
// before the zod contract (which keeps all limits) validates the answer.

type Json = { [key: string]: unknown };

const KEEP = new Set(['type', 'enum', 'const', 'description', 'additionalProperties']);

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullable(node: Json): Json {
  const branches = Array.isArray(node.anyOf) ? (node.anyOf as unknown[]) : undefined;
  if (branches?.some((branch) => isJson(branch) && branch.type === 'null')) return node;
  if (branches) return { ...node, anyOf: [...branches, { type: 'null' }] };
  return { anyOf: [node, { type: 'null' }] };
}

function strictify(node: unknown): Json {
  if (!isJson(node)) return {};
  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (KEEP.has(key)) out[key] = value;
    else if ((key === 'anyOf' || key === 'oneOf') && Array.isArray(value))
      out.anyOf = value.map(strictify);
    else if (key === 'items') out.items = strictify(value);
  }
  if (isJson(node.properties)) {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    const properties: Json = {};
    for (const [key, value] of Object.entries(node.properties)) {
      const property = strictify(value);
      properties[key] = required.has(key) ? property : nullable(property);
    }
    out.properties = properties;
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  }
  return out;
}

export function toStrictJsonSchema(schema: z.ZodType): Json {
  return strictify(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'throw' }));
}

/** Drops nulls that stand for a missing optional field; keeps nulls the schema allows. */
function dropOptionalNulls(schema: z.ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault)
    return value === null ? undefined : dropOptionalNulls(schema.unwrap() as z.ZodType, value);
  if (schema instanceof z.ZodNullable)
    return value === null ? null : dropOptionalNulls(schema.unwrap() as z.ZodType, value);
  if (schema instanceof z.ZodArray && Array.isArray(value))
    return value.map((item) => dropOptionalNulls(schema.element as z.ZodType, item));
  if (schema instanceof z.ZodObject && isJson(value)) {
    const shape = schema.shape as { [key: string]: z.ZodType };
    const out: Json = {};
    for (const [key, item] of Object.entries(value)) {
      const field = shape[key];
      const cleaned = field ? dropOptionalNulls(field, item) : item;
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  if (schema instanceof z.ZodUnion) {
    for (const option of schema.options as z.ZodType[]) {
      const cleaned = dropOptionalNulls(option, value);
      if (option.safeParse(cleaned).success) return cleaned;
    }
  }
  return value;
}

/** Validates model output against the zod contract; undefined when it does not fit. */
export function parseModelOutput<T>(schema: z.ZodType<T>, raw: unknown): T | undefined {
  const result = schema.safeParse(dropOptionalNulls(schema, raw));
  return result.success ? result.data : undefined;
}
