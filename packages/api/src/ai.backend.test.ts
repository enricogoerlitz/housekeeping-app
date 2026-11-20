// The real AI in backend mode (spec 0003, REQ-008): assistant, AI search and speech token go to
// the edge functions with the active household; errors become calm German messages; offline
// nothing is sent.
import type { AiSearchResult, AssistantReply } from '@housekeeping/core';
import { describe, expect, it, vi } from 'vitest';

import {
  AI_FAILED_MESSAGE,
  AI_QUOTA_MESSAGE,
  AI_SIGN_IN_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  AiError,
  aiSearchAsync,
  askAssistantAsync,
  createAiSearchController,
  getSpeechToken,
} from './ai';
import { AI_SAMPLE_NOTE } from './assistant';
import { H, withBackend } from './backend-test-helpers';
import { OfflineError } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const CURRY = 'rec-mango-curry';

const reply: AssistantReply = {
  text: 'Hier ist mein Vorschlag.',
  proposal: {
    id: 'p1',
    title: 'Mango-Curry ändern',
    note: '',
    parts: [
      {
        id: 'servings',
        label: 'Portionen',
        before: '4',
        after: '6',
        command: { type: 'setRecipeServings', recipeId: CURRY, servings: 6 },
      },
    ],
  },
  consulted: '1 Rezept gelesen',
};

const searchResult: AiSearchResult = {
  chips: [{ id: 'term:tofu', label: 'Tofu' }],
  results: [{ recipeId: CURRY, reason: 'mit Tofu' }],
  trace: '1 Runde',
  note: '',
};

const token = (expiresAt: string) => ({
  token: 'short-lived',
  region: 'westeurope',
  expiresAt,
  language: 'de-DE',
});

describe('askAssistantAsync (backend)', () => {
  it('AC-026: sends the request with the active household and returns the proposal unchanged', async () => {
    await fx.startEnrico();
    const requests: unknown[] = [];
    fx.server.setAi({
      assistant: (request) => {
        requests.push(request);
        return reply;
      },
    });
    const answer = await askAssistantAsync('  Mach das vegan und für 6 Personen ', {
      recipeId: CURRY,
    });
    expect(answer).toEqual(reply);
    expect(answer.proposal?.note).not.toBe(AI_SAMPLE_NOTE);
    expect(requests).toEqual([
      {
        householdId: H,
        message: 'Mach das vegan und für 6 Personen',
        context: { recipeId: CURRY },
      },
    ]);
    // Asking changes nothing: no write went out.
    expect(fx.calls.map((call) => call.fn)).toEqual(['askAssistant']);
  });

  it('AC-029: an unreachable AI service says so in German', async () => {
    await fx.startEnrico();
    fx.server.setAi({});
    await expect(askAssistantAsync('Hallo', {})).rejects.toThrow(AI_UNAVAILABLE_MESSAGE);
    expect(AI_UNAVAILABLE_MESSAGE).toBe('Der Assistent ist gerade nicht erreichbar');
    fx.server.setAi({ assistant: () => reply });
    fx.server.failNext('ai-assistant', new TransportError('transient', 'network', 0));
    await expect(askAssistantAsync('Hallo', {})).rejects.toThrow(AI_UNAVAILABLE_MESSAGE);
    fx.server.failNext('ai-assistant', new TransportError('transient', 'timeout', 0));
    await expect(askAssistantAsync('Hallo', {})).rejects.toBeInstanceOf(AiError);
  });

  it('AC-030: an exhausted quota says so in German', async () => {
    await fx.startEnrico();
    fx.server.setAi({ assistant: () => reply });
    fx.server.failNext('ai-assistant', new TransportError('transient', 'quota_exceeded', 429));
    await expect(askAssistantAsync('Hallo', {})).rejects.toThrow(AI_QUOTA_MESSAGE);
    expect(AI_QUOTA_MESSAGE).toBe('Für heute ist das KI-Kontingent aufgebraucht');
  });

  it('an expired session asks to sign in again; anything else is a generic message', async () => {
    await fx.startEnrico();
    fx.server.setAi({ assistant: () => reply });
    fx.server.failNext('ai-assistant', new TransportError('permanent', 'unauthorized', 401));
    await expect(askAssistantAsync('Hallo', {})).rejects.toThrow(AI_SIGN_IN_MESSAGE);
    fx.server.failNext('ai-assistant', new TransportError('permanent', 'invalid_response'));
    await expect(askAssistantAsync('Hallo', {})).rejects.toThrow(AI_FAILED_MESSAGE);
    fx.server.failNext('ai-assistant', new TransportError('permanent', 'internal', 500));
    await expect(askAssistantAsync('Hallo', {})).rejects.toThrow(AI_FAILED_MESSAGE);
  });

  it('offline: refused with OfflineError before anything is sent', async () => {
    const engine = await fx.startEnrico();
    fx.server.setAi({ assistant: () => reply });
    engine.setSimulatedOffline(true);
    await expect(askAssistantAsync('Hallo', {})).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });
});

describe('aiSearchAsync (backend)', () => {
  it('AC-027: sends query and removed chips with the active household', async () => {
    await fx.startEnrico();
    const requests: unknown[] = [];
    fx.server.setAi({
      search: (request) => {
        requests.push(request);
        return searchResult;
      },
    });
    await expect(aiSearchAsync('was Schnelles mit Tofu', ['fast'])).resolves.toEqual(searchResult);
    expect(requests).toEqual([
      { householdId: H, query: 'was Schnelles mit Tofu', disabledChips: ['fast'] },
    ]);
  });

  it('errors and offline like the assistant', async () => {
    const engine = await fx.startEnrico();
    fx.server.setAi({});
    await expect(aiSearchAsync('Tofu', [])).rejects.toThrow(AI_UNAVAILABLE_MESSAGE);
    engine.setSimulatedOffline(true);
    await expect(aiSearchAsync('Tofu', [])).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls.map((call) => call.fn)).toEqual(['aiSearch']);
  });
});

describe('getSpeechToken (backend)', () => {
  it('AC-028: reuses the token until one minute before it expires', async () => {
    await fx.startEnrico();
    let issued = 0;
    fx.server.setAi({
      speechToken: () => {
        issued += 1;
        return token(new Date(Date.now() + 9 * 60_000).toISOString());
      },
    });
    const first = await getSpeechToken();
    expect(first).toMatchObject({ token: 'short-lived', region: 'westeurope', language: 'de-DE' });
    await vi.advanceTimersByTimeAsync(7 * 60_000);
    await getSpeechToken();
    expect(issued).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000 + 1);
    await getSpeechToken();
    expect(issued).toBe(2);
  });

  it('a quota for speech and offline are reported like the other AI calls', async () => {
    const engine = await fx.startEnrico();
    fx.server.setAi({ speechToken: () => token(new Date(Date.now() + 9 * 60_000).toISOString()) });
    fx.server.failNext('speech-token', new TransportError('transient', 'quota_exceeded', 429));
    await expect(getSpeechToken()).rejects.toThrow(AI_QUOTA_MESSAGE);
    engine.setSimulatedOffline(true);
    await expect(getSpeechToken()).rejects.toBeInstanceOf(OfflineError);
  });
});

describe('createAiSearchController (backend)', () => {
  it('AC-027: with the switch off nothing is sent, however long the query sits there', async () => {
    await fx.startEnrico();
    fx.server.setAi({ search: () => searchResult });
    const controller = createAiSearchController();
    controller.update({ enabled: false, query: 'was Schnelles mit Tofu' });
    await vi.advanceTimersByTimeAsync(5_000);
    controller.runNow([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fx.calls).toEqual([]);
    expect(controller.getState()).toEqual({ status: 'idle' });
    controller.dispose();
  });

  it('AC-027: switched on, typing is debounced into one request, then shows the result', async () => {
    await fx.startEnrico();
    fx.server.setAi({ search: () => searchResult });
    const controller = createAiSearchController();
    const states: string[] = [];
    const stop = controller.subscribe(() => states.push(controller.getState().status));
    controller.update({ enabled: true, query: 'was' });
    await vi.advanceTimersByTimeAsync(300);
    controller.update({ enabled: true, query: 'was Schnelles' });
    await vi.advanceTimersByTimeAsync(300);
    controller.update({ enabled: true, query: 'was Schnelles mit Tofu' });
    await vi.advanceTimersByTimeAsync(599);
    expect(fx.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fx.calls).toEqual([{ fn: 'aiSearch', args: [expect.anything()] }]);
    expect(controller.getState()).toEqual({
      status: 'done',
      query: 'was Schnelles mit Tofu',
      disabledChips: [],
      result: searchResult,
    });
    expect([...new Set(states)]).toEqual(['loading', 'done']);
    stop();
    controller.dispose();
  });

  it('removing a chip searches again at once; an empty query or switching off clears it', async () => {
    await fx.startEnrico();
    fx.server.setAi({ search: () => searchResult });
    const controller = createAiSearchController();
    controller.update({ enabled: true, query: 'Tofu' });
    await vi.advanceTimersByTimeAsync(600);
    controller.runNow(['term:tofu']);
    await vi.advanceTimersByTimeAsync(0);
    expect(fx.calls.map((call) => call.args[0])).toEqual([
      { householdId: H, query: 'Tofu', disabledChips: [] },
      { householdId: H, query: 'Tofu', disabledChips: ['term:tofu'] },
    ]);
    controller.update({ enabled: true, query: '  ' });
    expect(controller.getState()).toEqual({ status: 'idle' });
    controller.update({ enabled: true, query: 'Tofu' });
    controller.update({ enabled: false, query: 'Tofu' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fx.calls).toHaveLength(2);
    expect(controller.getState()).toEqual({ status: 'idle' });
    controller.dispose();
  });

  it('a late answer to an older query never overwrites the newer one', async () => {
    await fx.startEnrico();
    const pending: ((result: AiSearchResult) => void)[] = [];
    const controller = createAiSearchController({
      search: (query) =>
        new Promise<AiSearchResult>((resolve) => {
          pending.push((result) => resolve({ ...result, trace: query }));
        }),
    });
    controller.update({ enabled: true, query: 'alt' });
    await vi.advanceTimersByTimeAsync(600);
    controller.update({ enabled: true, query: 'neu' });
    await vi.advanceTimersByTimeAsync(600);
    pending[1]?.(searchResult);
    await vi.advanceTimersByTimeAsync(0);
    pending[0]?.(searchResult);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toMatchObject({ status: 'done', query: 'neu' });
    controller.dispose();
  });

  it('AC-029: a failed search shows the German message', async () => {
    await fx.startEnrico();
    fx.server.setAi({});
    const controller = createAiSearchController();
    controller.update({ enabled: true, query: 'Tofu' });
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toEqual({
      status: 'error',
      query: 'Tofu',
      disabledChips: [],
      message: AI_UNAVAILABLE_MESSAGE,
    });
    controller.dispose();
  });
});
