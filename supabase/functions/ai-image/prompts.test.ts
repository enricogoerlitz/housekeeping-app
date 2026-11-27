import { describe, expect, it } from 'vitest';

import { parseModelOutput } from '../_shared/strict-schema.ts';
import {
  IMAGE_GUARDRAIL,
  ImagePromptsSchema,
  directPrompt,
  enhancementInput,
  fluxPrompts,
  withGuardrail,
} from './prompts.ts';

const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000001';
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

/** The data part of the one user message, parsed back. */
function data(input: ReturnType<typeof enhancementInput>): { [key: string]: unknown } {
  const [message] = input;
  const parts = Array.isArray(message?.content) ? message.content : [];
  const text = parts.find((part) => part.type === 'input_text');
  if (text?.type !== 'input_text') throw new Error('no text part');
  const json = text.text.slice(text.text.indexOf('{'));
  return JSON.parse(json) as { [key: string]: unknown };
}

describe('the enhancement request (spec 0052, REQ-001)', () => {
  it('AC-002: kind, title, ingredients, style and the wish go to the language model as data', () => {
    const input = enhancementInput({
      householdId: HOUSEHOLD,
      prompt: 'von oben, rustikal',
      styles: ['top'],
      context: { kind: 'recipe', title: 'Linsen-Dal', ingredients: ['Rote Linsen', 'Kokosmilch'] },
    });
    expect(input).toHaveLength(1);
    expect(data(input)).toEqual({
      kind: 'recipe',
      title: 'Linsen-Dal',
      ingredients: ['Rote Linsen', 'Kokosmilch'],
      wish: 'von oben, rustikal',
      styles: ['Shot from directly above (flat lay).'],
      sourcePhoto: false,
    });
  });

  it('AC-011: the extra of "Neu generieren" travels as its own field', () => {
    const fields = data(
      enhancementInput({
        householdId: HOUSEHOLD,
        prompt: 'spaghetti with meatballs in tomato sauce',
        extra: 'heller und mit Basilikum',
        context: { kind: 'recipe', title: 'Spaghetti mit Bällchen in Tomatensoße' },
      }),
    );
    expect(fields.extra).toBe('heller und mit Basilikum');
    expect(fields.wish).toBe('spaghetti with meatballs in tomato sauce');
  });

  it('without context the kind is unknown, not guessed', () => {
    expect(data(enhancementInput({ householdId: HOUSEHOLD, prompt: 'Pasta' }))).toEqual({
      wish: 'Pasta',
      sourcePhoto: false,
    });
  });

  it('AC-004: "Aus diesem Foto": the language model is told, but gets no photo', () => {
    const input = enhancementInput({
      householdId: HOUSEHOLD,
      prompt: 'Text entfernen',
      image: PHOTO,
    });
    expect(JSON.stringify(input)).not.toContain('base64');
    expect(data(input).sourcePhoto).toBe(true);
  });
});

describe('the answer of the language model (spec 0052)', () => {
  const scene = 'A woman bouldering in a modern indoor climbing gym, colourful holds, crash mats.';
  const shots = [
    'Wide view from floor level, soft light.',
    'Side view at medium distance, warm light.',
    'Close view from below, directional light.',
  ];

  it('AC-001: one scene and exactly three shots are taken', () => {
    expect(parseModelOutput(ImagePromptsSchema, { scene, shots })).toEqual({ scene, shots });
    expect(parseModelOutput(ImagePromptsSchema, { scene, shots: shots.slice(0, 2) })).toBe(
      undefined,
    );
    expect(parseModelOutput(ImagePromptsSchema, { scene: 'x'.repeat(1001), shots })).toBe(
      undefined,
    );
    expect(parseModelOutput(ImagePromptsSchema, { prompts: shots })).toBe(undefined);
  });

  it('AC-001, AC-003: three prompts, each the scene with its own shot and the ban on text', () => {
    expect(fluxPrompts({ scene, shots })).toEqual(
      shots.map((shot) => `${scene} ${shot} ${IMAGE_GUARDRAIL}`),
    );
  });

  it('AC-003: the ban on text ends every prompt, never twice', () => {
    expect(withGuardrail('A woman bouldering in a bright hall.')).toBe(
      `A woman bouldering in a bright hall. ${IMAGE_GUARDRAIL}`,
    );
    expect(withGuardrail('A woman bouldering')).toBe(`A woman bouldering. ${IMAGE_GUARDRAIL}`);
    expect(withGuardrail(`Pasta. ${IMAGE_GUARDRAIL}`)).toBe(`Pasta. ${IMAGE_GUARDRAIL}`);
  });
});

describe('the direct prompt, without enhancement (spec 0040; spec 0052, REQ-002)', () => {
  it('AC-005: the wish, the style chips and the house style', () => {
    const prompt = directPrompt({ householdId: HOUSEHOLD, prompt: 'Pasta', styles: ['rustic'] });
    expect(prompt).toContain('Subject: Pasta.');
    expect(prompt).toMatch(/rustic wooden table/i);
    expect(prompt).toMatch(/no text/);
  });

  it('AC-012: the extra of "Neu generieren" ends the wish', () => {
    const prompt = directPrompt({
      householdId: HOUSEHOLD,
      prompt: 'spaghetti with meatballs',
      extra: 'heller und mit Basilikum',
    });
    expect(prompt).toContain('Subject: spaghetti with meatballs. heller und mit Basilikum.');
  });
});
