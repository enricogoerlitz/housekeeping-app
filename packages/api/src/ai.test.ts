// Demo mode (no sign-in): the AI functions keep the simulated answers of spec 0001 and never
// touch the network.
import { describe, expect, it, vi } from 'vitest';

import { aiSearchAsync, askAssistantAsync, createAiSearchController, getSpeechToken } from './ai';
import { AI_NO_ANSWER, AI_SAMPLE_NOTE } from './assistant';
import { withDemoHousehold } from './test-helpers';

withDemoHousehold();

describe('AI in demo mode', () => {
  it('AC-040: the assistant answers the samples, marked as sample answer', async () => {
    const reply = await askAssistantAsync('Mach das vegan und für 6 Personen', {
      recipeId: 'rec-mango-curry',
    });
    expect(reply.proposal?.note).toBe(AI_SAMPLE_NOTE);
    await expect(askAssistantAsync('Wie wird das Wetter?', {})).resolves.toEqual({
      text: AI_NO_ANSWER,
    });
  });

  it('AC-042: the AI search is the simulated one', async () => {
    const result = await aiSearchAsync('was Schnelles mit Tofu', []);
    expect(result.note).toBe(AI_SAMPLE_NOTE);
    expect(result.chips.length).toBeGreaterThan(0);
  });

  it('there is no speech token without the backend', async () => {
    await expect(getSpeechToken()).rejects.toThrow();
  });

  it('the controller debounces the simulated search too', async () => {
    vi.useFakeTimers();
    try {
      const controller = createAiSearchController();
      controller.update({ enabled: true, query: 'Tofu' });
      expect(controller.getState().status).toBe('loading');
      await vi.advanceTimersByTimeAsync(600);
      expect(controller.getState()).toMatchObject({ status: 'done', query: 'Tofu' });
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
