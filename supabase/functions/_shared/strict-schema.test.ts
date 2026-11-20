import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AssistantCommandSchema } from './contract.gen.ts';
import { parseModelOutput, toStrictJsonSchema } from './strict-schema.ts';

type Node = { [key: string]: unknown };

function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) node.forEach((item) => walk(item, visit));
  else if (node && typeof node === 'object') {
    visit(node as Node);
    Object.values(node).forEach((value) => walk(value, visit));
  }
}

const Sample = z.strictObject({
  text: z.string().trim().min(1).max(10),
  note: z.string().max(5).optional(),
  command: AssistantCommandSchema,
});

describe('toStrictJsonSchema', () => {
  it('makes every object strict: all properties required, no additional properties', () => {
    const schema = toStrictJsonSchema(Sample);
    walk(schema, (node) => {
      if (node.type !== 'object') return;
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required as string[])].sort()).toEqual(
        Object.keys(node.properties as Node).sort(),
      );
    });
  });

  it('turns optional properties into nullable ones and unions into anyOf', () => {
    const schema = toStrictJsonSchema(Sample) as {
      properties: { note: Node; command: Node };
    };
    expect(schema.properties.note).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(schema.properties.command.anyOf).toBeInstanceOf(Array);
    walk(schema, (node) => expect(node).not.toHaveProperty('oneOf'));
  });

  it('drops keywords strict mode rejects (lengths, patterns, formats, bounds, $schema)', () => {
    const forbidden = [
      '$schema',
      'minLength',
      'maxLength',
      'pattern',
      'format',
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'minItems',
      'maxItems',
      'default',
    ];
    walk(toStrictJsonSchema(Sample), (node) => {
      for (const key of forbidden) expect(node).not.toHaveProperty(key);
    });
  });
});

describe('parseModelOutput', () => {
  it('removes nulls the model sends for optional fields, keeps real nulls', () => {
    const parsed = parseModelOutput(Sample, {
      text: 'Hallo',
      note: null,
      command: {
        type: 'addPlanEntry',
        input: {
          date: null,
          slotId: 's1',
          kind: 'text',
          recipeId: null,
          restaurantId: null,
          text: 'Pizza',
          leftoversOfEntryId: null,
          eaterIds: [],
          guests: null,
          portions: null,
          variants: null,
          cookId: null,
        },
      },
    });
    expect(parsed).toEqual({
      text: 'Hallo',
      command: {
        type: 'addPlanEntry',
        input: { date: null, slotId: 's1', kind: 'text', text: 'Pizza', eaterIds: [] },
      },
    });
  });

  it('returns undefined for output that breaks the zod contract', () => {
    expect(parseModelOutput(Sample, { text: 'x'.repeat(11), note: null })).toBeUndefined();
    expect(
      parseModelOutput(Sample, {
        text: 'ok',
        note: null,
        command: { type: 'deleteHousehold', householdId: 'h1' },
      }),
    ).toBeUndefined();
    expect(parseModelOutput(Sample, 'kein Objekt')).toBeUndefined();
  });
});
