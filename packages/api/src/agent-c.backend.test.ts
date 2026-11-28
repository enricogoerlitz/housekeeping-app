// Spec 0067, step C: the operation of the agent in the app (AC-024: another person's answer runs,
// REQ-015: below the minimum version nothing is sent or applied) and the new commands of its
// proposals (the heart of an activity, "Füll die Woche" with guests).
import { addDays, resolveAction, type AgentAction } from '@housekeeping/core';
import { afterEach, describe, expect, it } from 'vitest';

import { AI_CHAT_BUSY_MESSAGE, AiError } from './ai';
import { agentChatAnswering, sendAgentMessage } from './ai-agent';
import { agentProposalData, runAgentCommand } from './agent-actions';
import { readAppVersionState, startAppVersionCheck, stopAppVersionCheck } from './app-version';
import { H, TODAY, withBackend } from './backend-test-helpers';
import { planSuggested } from './commands-plan';
import { ENRICO, NADJA, SLOT_DINNER } from './seed/demo';
import { getData, OfflineError } from './store';
import { TransportError } from './transport';

const fx = withBackend();
const place = { source: 'device' as const, label: 'Aktueller Standort', radius: 'walk' as const };
const CHAT = 'cccccccc-0000-4000-8000-000000000001';

afterEach(() => stopAppVersionCheck());

describe('one answer per chat (AC-024)', () => {
  it('AC-024: a send while the other answer runs is AiError "Agent antwortet gerade …"', async () => {
    await fx.startEnrico();
    fx.server.setAi({
      agent: () => {
        throw new TransportError('permanent', 'chat_busy', 409);
      },
    });
    const failed = await sendAgentMessage(
      { chatId: CHAT, message: 'Und Mittwoch?', place },
      () => undefined,
      new AbortController().signal,
    ).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(AiError);
    expect((failed as AiError).reason).toBe('busy');
    expect((failed as AiError).message).toBe(AI_CHAT_BUSY_MESSAGE);
  });

  it('AC-024: the app asks whether an answer runs; a foreign chat is refused', async () => {
    await fx.startEnrico();
    fx.server.setAi({
      agent: () => [{ type: 'chat', chatId: CHAT, title: 'Hallo' }, { type: 'done' }],
      agentAnswering: (id) => id === CHAT,
    });
    await sendAgentMessage(
      { message: 'Hallo', place },
      () => undefined,
      new AbortController().signal,
    );
    const chatId = getData().aiChats[0]!.id;
    expect(await agentChatAnswering(chatId)).toBe(true);
    await expect(agentChatAnswering('cccccccc-0000-4000-8000-0000000000ff')).rejects.toBeInstanceOf(
      AiError,
    );
  });
});

describe('below the minimum app version (REQ-015)', () => {
  it('agent actions are refused like other writes: nothing is sent, nothing applied', async () => {
    startAppVersionCheck({
      own: '2026.12.4',
      environment: fx.environment,
      readLatest: () => Promise.resolve('2026.12.5'),
      readMin: () => Promise.resolve('2026.12.5'),
    });
    await fx.startEnrico();
    expect(readAppVersionState()).toBe('nicht-unterstuetzt');
    let sent = 0;
    fx.server.setAi({
      agent: () => {
        sent += 1;
        return [{ type: 'done' }];
      },
    });
    await expect(
      sendAgentMessage(
        { message: 'Milch auf die Liste', place },
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(OfflineError);
    expect(sent).toBe(0);
    // "Auf die Liste" is a store-mode write (held in the queue like offline); the card's button is
    // greyed out by useOnlineOnly. Every other command is refused here.
    await expect(
      runAgentCommand({ type: 'logDone', title: 'Fenster geputzt' }),
    ).rejects.toBeInstanceOf(OfflineError);
  });
});

describe('new commands of the proposals (spec 0067, step C)', () => {
  it('the heart of an activity runs its own command; "nicht mehr merken" the remember path', async () => {
    await fx.startEnrico();
    const activity = getData().activities[0]!;
    const run = (action: AgentAction) => {
      const entry = resolveAction(action, agentProposalData());
      if (!entry.command) throw new Error(entry.problem);
      return runAgentCommand(entry.command);
    };
    await run({ kind: 'set_favorite', target: 'activity', name: activity.name });
    await fx.settle();
    expect(getData().activities[0]?.favoriteOf).toContain(ENRICO);
    const remembered = getData().activities[0]!.remembered;
    await run({
      kind: 'set_remembered',
      target: 'activity',
      name: activity.name,
      favorite: !remembered,
    });
    await fx.settle();
    expect(getData().activities[0]?.remembered).toBe(!remembered);
  });

  it('"Mit KI ausarbeiten" is no write: running it as a command is refused', async () => {
    await fx.startEnrico();
    await expect(runAgentCommand({ type: 'workOut', recipeId: 'rec-lasagne' })).rejects.toThrow();
  });

  it('REQ-014: "Füll die Woche" plans guests on their evening in the one change of spec 0063', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const saturday = addDays(TODAY, 8);
    const before = fx.calls.length;
    planSuggested(
      [
        { recipeId: 'rec-lasagne', date: saturday, guests: 2 },
        { recipeId: 'rec-gemischter-salat', date: addDays(TODAY, 9) },
      ],
      SLOT_DINNER,
    );
    await fx.settle(nadja);
    expect(fx.calls.slice(before).map((call) => call.fn)).toEqual(['applyChanges']);
    const lasagne = getData().planEntries.find(
      (entry) => entry.recipeId === 'rec-lasagne' && entry.date === saturday,
    );
    expect(lasagne).toMatchObject({ eaterIds: [ENRICO, NADJA], guests: 2, portions: 4 });
    expect(fx.server.row(H, 'meal_plan_entries', lasagne!.id)).toMatchObject({ guests: 2 });
  });
});
