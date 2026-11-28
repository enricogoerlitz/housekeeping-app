import { describe, expect, it } from 'vitest';

import {
  AgentRequestSchema,
  AgentStreamEventSchema,
  draftOutput,
  imagesOutput,
  messagesFromItems,
  proposalStep,
} from './ai-agent';
import type { RecipeDraftReply } from './ai-contract';

const reply: RecipeDraftReply = {
  draft: {
    title: 'Linsen-Dal',
    description: 'Cremig und schnell.',
    servings: 2,
    totalMinutes: 30,
    course: 'main',
    tags: [],
    variants: [],
    ingredients: [
      { name: 'Rote Linsen', amount: '200 g' },
      { name: 'Karotten', amount: '2' },
    ],
    steps: [{ text: 'Alles kochen.' }],
  },
  sources: [{ url: 'https://www.tiktok.com/@k/video/1', kind: 'tiktok', read: true }],
};

const user = (text: string) => ({
  type: 'message',
  role: 'user',
  content: [
    { type: 'input_text', text: '[KONTEXT]\nOrt: x\n[/KONTEXT]' },
    { type: 'input_text', text },
  ],
});
const call = (name: string, callId: string, args: unknown) => ({
  type: 'function_call',
  name,
  call_id: callId,
  arguments: JSON.stringify(args),
});
const output = (callId: string, text: string) => ({
  type: 'function_call_output',
  call_id: callId,
  output: text,
});
const empty = {
  target: null,
  id: null,
  date: null,
  slot: null,
  time: null,
  address: null,
  note: null,
  servings: null,
  favorite: null,
  weekday: null,
  every_weeks: null,
};

describe('extras of a stored conversation (spec 0067, step B)', () => {
  it('REQ-009: a proposal comes back as its card; a delete without the wish stays out (AC-020)', () => {
    const [, answer] = messagesFromItems([
      user('Milch auf die Liste'),
      call('propose_actions', 'call_p', {
        title: 'Liste',
        actions: [
          { ...empty, kind: 'add_to_list', name: 'Milch' },
          { ...empty, kind: 'remove_from_list', name: 'Eier' },
        ],
      }),
      output('call_p', '{"shown":true}'),
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Steht da.' }] },
    ]);
    expect(answer?.extras).toEqual([
      {
        kind: 'proposal',
        proposal: {
          id: 'call_p',
          title: 'Liste',
          actions: [{ kind: 'add_to_list', name: 'Milch' }],
        },
      },
    ]);
    expect(answer?.steps).toEqual([]);
  });

  it('REQ-010: a recipe draft comes back from its output, with its step row', () => {
    const args = {
      wish: 'für 2',
      links: ['https://www.tiktok.com/@k/video/1'],
      page_text: null,
      page_url: null,
      refine: false,
      use_photos: false,
    };
    const [, answer] = messagesFromItems([
      user('leg das an, für 2'),
      call('draft_recipe', 'call_d', args),
      output('call_d', draftOutput(reply)),
    ]);
    expect(answer?.extras).toEqual([{ kind: 'recipe_draft', id: 'call_d', reply }]);
    expect(answer?.steps.map((step) => [step.label, step.detail])).toEqual([
      ['Schreibt einen Rezeptentwurf', 'tiktok.com'],
    ]);
  });

  it('AC-022: an unreadable link says so in its step row and makes no card', () => {
    const step = proposalStep(
      'draft_recipe',
      JSON.stringify({ wish: 'x', links: ['https://koch.de/a'], refine: false, use_photos: false }),
      '{"error":"link_unreadable"}',
      't1',
    );
    expect(step?.detail).toBe('Link nicht lesbar');
    const [, answer] = messagesFromItems([
      user('leg das an'),
      call('draft_recipe', 'call_d', { wish: 'x', links: [], refine: false, use_photos: false }),
      output('call_d', '{"error":"link_unreadable"}'),
    ]);
    expect(answer).toBeUndefined();
  });

  it('REQ-011: one AI photo and a row of Google images come back', () => {
    const images = [
      {
        imageUrl: 'https://img.example.com/a.jpg',
        pageUrl: 'https://koch.de/dal',
        host: 'koch.de',
        title: 'Dal',
      },
    ];
    const [, answer] = messagesFromItems([
      user('mach ein Foto dazu und zeig echte Bilder'),
      call('make_image', 'call_i', { prompt: 'Lentil dal in a bowl', for: 'draft', name: null }),
      output('call_i', '{"shown":true}'),
      call('show_images', 'call_s', { query: 'Linsen Dal', for: 'draft', name: null }),
      output('call_s', imagesOutput(images)),
    ]);
    expect(answer?.extras).toEqual([
      { kind: 'image', id: 'call_i', prompt: 'Lentil dal in a bowl', for: 'draft' },
      { kind: 'images', id: 'call_s', query: 'Linsen Dal', images, for: 'draft' },
    ]);
    expect(answer?.steps.map((step) => [step.label, step.detail, step.count])).toEqual([
      ['Sucht Bilder', '„Linsen Dal“', 1],
    ]);
  });

  it('invalid input: broken outputs and non-https images give no extra', () => {
    const [, answer] = messagesFromItems([
      user('Bilder'),
      call('show_images', 'call_s', { query: 'Dal', for: 'recipe', name: 'Dal' }),
      output(
        'call_s',
        JSON.stringify({ images: [{ imageUrl: 'http://x/a.jpg', pageUrl: 'x', host: 'x' }] }),
      ),
      call('draft_recipe', 'call_d', { wish: 'x', links: [], refine: false, use_photos: false }),
      output('call_d', '{nope'),
    ]);
    expect(answer?.extras ?? []).toEqual([]);
  });

  it('the stream carries an extra', () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: 'extra',
        extra: { kind: 'recipe_draft', id: 'c', reply },
      }).success,
    ).toBe(true);
    expect(
      AgentStreamEventSchema.safeParse({ type: 'extra', extra: { kind: 'delete_all' } }).success,
    ).toBe(false);
  });
});

describe('editing a sent message (spec 0067, preview feedback 28.11.)', () => {
  const base = {
    action: 'send',
    householdId: '6f1c0f5e-0000-4000-8000-0000000000aa',
    message: 'Doch für 4',
    place: { source: 'device', label: 'Aktueller Standort', radius: 'walk' },
    timeZone: 'Europe/Berlin',
  };
  it("editFrom names the person's message to start again from, only in an existing chat", () => {
    expect(
      AgentRequestSchema.safeParse({
        ...base,
        chatId: '6f1c0f5e-0000-4000-8000-0000000000bb',
        editFrom: 1,
      }).success,
    ).toBe(true);
    expect(AgentRequestSchema.safeParse({ ...base, editFrom: 1 }).success).toBe(false);
    expect(
      AgentRequestSchema.safeParse({
        ...base,
        chatId: '6f1c0f5e-0000-4000-8000-0000000000bb',
        editFrom: -1,
      }).success,
    ).toBe(false);
  });
});
