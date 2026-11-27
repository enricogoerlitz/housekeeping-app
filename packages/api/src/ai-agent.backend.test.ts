// KI-Agent (spec 0066): sending streams the events of the active household's chat and brings the
// new chat into the history (cache); loading and deleting go through ai-agent; offline nothing is
// sent; "Haushalt endgültig löschen" deletes the chats first.
import type { AgentStreamEvent } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { AI_CHAT_TOO_LONG_MESSAGE, AiError } from './ai';
import { deleteAgentChat, loadAgentChat, purgeAgentChats, sendAgentMessage } from './ai-agent';
import { H, withBackend } from './backend-test-helpers';
import { createHousehold, deleteHousehold, switchHousehold } from './commands-household';
import { getData, getState, OfflineError } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const CHAT = 'cccccccc-0000-4000-8000-000000000001';
const place = { source: 'device' as const, label: 'Aktueller Standort', radius: 'walk' as const };

const answer: AgentStreamEvent[] = [
  { type: 'chat', chatId: CHAT, title: 'Romantisch in Mitte' },
  { type: 'text', delta: 'Drei Häuser.' },
  { type: 'done' },
];

describe('sendAgentMessage', () => {
  it('AC-024: streams the events and the new chat reaches the history', async () => {
    await fx.startEnrico();
    const sent: unknown[] = [];
    fx.server.setAi({
      agent: (request) => {
        sent.push(request);
        return answer;
      },
    });
    const seen: AgentStreamEvent[] = [];
    await sendAgentMessage(
      { message: ' Romantisch in Mitte ', place },
      (event) => seen.push(event),
      new AbortController().signal,
    );
    expect(seen).toEqual(answer);
    expect(sent).toEqual([
      expect.objectContaining({
        action: 'send',
        householdId: H,
        message: 'Romantisch in Mitte',
        place,
      }),
    ]);
    expect((sent[0] as { timeZone: string }).timeZone).toMatch(/\w/);
    expect(getData().aiChats.map((chat) => chat.title)).toEqual(['Romantisch in Mitte']);
  });

  it('AC-035: a chat with 20 answers is AiError with the hint for a new chat', async () => {
    await fx.startEnrico();
    fx.server.setAi({
      agent: () => {
        throw new TransportError('permanent', 'chat_too_long', 409);
      },
    });
    const failed = await sendAgentMessage(
      { chatId: CHAT, message: 'Noch was?', place },
      () => undefined,
      new AbortController().signal,
    ).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(AiError);
    expect((failed as AiError).message).toBe(AI_CHAT_TOO_LONG_MESSAGE);
  });

  it('an error event in the stream is an AiError after the events before it', async () => {
    await fx.startEnrico();
    fx.server.setAi({
      agent: () => [
        { type: 'text', delta: 'Moment' },
        { type: 'error', error: 'quota_exceeded' },
      ],
    });
    const seen: AgentStreamEvent[] = [];
    const failed = await sendAgentMessage(
      { message: 'x', place },
      (event) => seen.push(event),
      new AbortController().signal,
    ).catch((error: unknown) => error);
    expect(seen).toEqual([{ type: 'text', delta: 'Moment' }]);
    expect((failed as AiError).reason).toBe('quota');
  });

  it('AC-039: offline nothing is sent', async () => {
    const engine = await fx.startEnrico();
    engine.setSimulatedOffline(true);
    let calls = 0;
    fx.server.setAi({
      agent: () => {
        calls += 1;
        return answer;
      },
    });
    await expect(
      sendAgentMessage({ message: 'x', place }, () => undefined, new AbortController().signal),
    ).rejects.toBeInstanceOf(OfflineError);
    expect(calls).toBe(0);
  });
});

describe('loading and deleting', () => {
  it('AC-025, AC-028: loads the messages, deletes the chat for every device', async () => {
    await fx.startEnrico();
    fx.server.setAi({
      agent: () => answer,
      agentMessages: () => [
        { role: 'user', text: 'Hallo', cards: [], followUps: [], sources: [], steps: [] },
      ],
    });
    await sendAgentMessage({ message: 'x', place }, () => undefined, new AbortController().signal);
    await expect(loadAgentChat(CHAT)).resolves.toEqual([
      { role: 'user', text: 'Hallo', cards: [], followUps: [], sources: [], steps: [] },
    ]);
    await deleteAgentChat(CHAT);
    expect(getData().aiChats).toEqual([]);
  });

  it('AC-031: deleting the household deletes its chats first', async () => {
    await fx.startEnrico();
    fx.server.setAi({ agent: () => answer });
    await sendAgentMessage({ message: 'x', place }, () => undefined, new AbortController().signal);
    expect(fx.server.rows(H, 'ai_chats')).toHaveLength(1);
    await expect(purgeAgentChats(H)).resolves.toBe(1);
    expect(fx.server.rows(H, 'ai_chats')).toHaveLength(0);
  });

  it('AC-031, AC-032: deleting a household deletes its chats before delete_household', async () => {
    await fx.startEnrico();
    const wg = await createHousehold('WG Köln');
    switchHousehold(wg);
    fx.server.setAi({ agent: () => answer });
    await sendAgentMessage({ message: 'x', place }, () => undefined, new AbortController().signal);
    expect(fx.server.rows(wg, 'ai_chats')).toHaveLength(1);
    fx.clearCalls();
    await deleteHousehold(wg);
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'beginHouseholdDeletion',
      'agentDelete',
      'deleteHousehold',
    ]);
    expect(getState().households[wg]).toBeUndefined();
  });
});
