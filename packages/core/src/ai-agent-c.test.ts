import { describe, expect, it } from 'vitest';

import {
  AGENT_LIMITS,
  AgentRequestSchema,
  AgentStatusReplySchema,
  AgentStreamEventSchema,
  agentEnvironment,
  changeOutput,
  extraOfCall,
  longChat,
  messagesFromItems,
  weekFillOutput,
} from './ai-agent';
import { ErrorCodeSchema } from './ai-contract';

// Spec 0067, step C: the variant from the chat, "Füll die Woche", bulk passes and the operation of
// the agent (one answer per chat, long chats, the environment of a conversation).

const RECIPE = '11111111-2222-4333-8444-555555555555';
const HOUSEHOLD = '22222222-2222-4333-8444-555555555555';
const week = {
  from: '2026-11-30',
  to: '2026-12-06',
  slot: null,
  vegetarian: 2,
  quick_days: ['2026-12-02'],
  guest_days: [{ date: '2026-12-05', count: 2 }],
  skip_days: [],
};

describe('change_recipe and fill_week as cards', () => {
  it('a variant of an existing recipe comes back from the output (the recipe the function found)', () => {
    const output = changeOutput({ id: RECIPE, title: 'Lasagne' }, 'vegetarische Variante');
    expect(
      extraOfCall(
        'change_recipe',
        'call_1',
        JSON.stringify({ id: null, name: 'Lasagne', wish: 'vegetarische Variante' }),
        output,
        '',
      ),
    ).toEqual({
      kind: 'recipe_change',
      id: 'call_1',
      recipeId: RECIPE,
      title: 'Lasagne',
      wish: 'vegetarische Variante',
    });
  });

  it('a recipe the function did not find gives no card, whatever the model sent', () => {
    expect(
      extraOfCall(
        'change_recipe',
        'call_1',
        JSON.stringify({ id: RECIPE, name: 'Lasagne', wish: 'vegan' }),
        JSON.stringify({ error: 'recipe_not_found' }),
        '',
      ),
    ).toBeUndefined();
  });

  it('REQ-014: the week to fill is the checked wishes; the dishes are the app’s', () => {
    const extra = extraOfCall('fill_week', 'call_2', JSON.stringify(week), weekFillOutput(), '');
    expect(extra).toEqual({
      kind: 'week_fill',
      id: 'call_2',
      wishes: {
        from: '2026-11-30',
        to: '2026-12-06',
        vegetarian: 2,
        quick: ['2026-12-02'],
        guests: [{ date: '2026-12-05', count: 2 }],
        skip: [],
      },
    });
    expect(AgentStreamEventSchema.safeParse({ type: 'extra', extra }).success).toBe(true);
    expect(
      extraOfCall('fill_week', 'call_2', '{"from":"x"}', weekFillOutput(), ''),
    ).toBeUndefined();
  });

  it('a stored chat shows both cards again', () => {
    const items = [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: '[KONTEXT]\n[/KONTEXT]' },
          { type: 'input_text', text: 'Füll die Woche' },
        ],
      },
      { type: 'function_call', name: 'fill_week', call_id: 'c1', arguments: JSON.stringify(week) },
      { type: 'function_call_output', call_id: 'c1', output: weekFillOutput() },
    ];
    expect(messagesFromItems(items)[1]?.extras.map((extra) => extra.kind)).toEqual(['week_fill']);
  });
});

describe('operation (REQ-015)', () => {
  it('AC-024: the app asks whether an answer runs; the answer is only yes or no', () => {
    expect(
      AgentRequestSchema.parse({ action: 'status', householdId: HOUSEHOLD, chatId: RECIPE }),
    ).toEqual({ action: 'status', householdId: HOUSEHOLD, chatId: RECIPE });
    expect(AgentRequestSchema.safeParse({ action: 'status', householdId: HOUSEHOLD }).success).toBe(
      false,
    );
    expect(AgentStatusReplySchema.parse({ answering: true })).toEqual({ answering: true });
    expect(ErrorCodeSchema.parse('chat_busy')).toBe('chat_busy');
  });

  it('from about 30 messages the chat suggests a new one; the hard end comes much later', () => {
    expect(longChat(29)).toBe(false);
    expect(longChat(30)).toBe(true);
    // Model runs, not answers: one answer takes up to five (the row keeps at most 100).
    expect(AGENT_LIMITS.turns).toBe(95);
  });

  it('decision 13: the environment of a conversation comes from the agent’s name', () => {
    expect(agentEnvironment('household-agent-preview')).toBe('preview');
    expect(agentEnvironment('household-agent-prod')).toBe('prod');
    expect(agentEnvironment('household-agent-local')).toBe('local');
    expect(agentEnvironment('my-agent')).toBeUndefined();
  });
});
