// Spec 0067, REQ-009: the agent's proposals applied through the app's own commands, one by one
// with their own result, undone with the usual snapshot; offline nothing runs.
import { recheckAction, resolveAction, type AgentAction } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { agentProposalData, runAgentCommand, savePhotoFromAddress } from './agent-actions';
import { H, withBackend } from './backend-test-helpers';
import { ARTICLE_GONE_MESSAGE } from './commands-shopping';
import { getData, OfflineError, snapshot } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
/** preparePhoto needs a canvas; the tests hand the image through as the prepared JPEG. */
const prepare = (image: Blob) => Promise.resolve(new Blob([image], { type: 'image/jpeg' }));

const openNames = () =>
  getData()
    .items.filter((item) => !item.checked)
    .map((item) => getData().articles.find((article) => article.id === item.articleId)?.name);

const bad = () => getData().chores.find((chore) => chore.title === 'Bad putzen');

function command(action: AgentAction) {
  const entry = resolveAction(action, agentProposalData());
  if (!entry.command) throw new Error(entry.problem);
  return entry.command;
}

describe('applying agent proposals (spec 0067, REQ-009)', () => {
  it('AC-018: three of four entries apply, each through its command; "Rückgängig" takes all three back', async () => {
    await fx.startEnrico();
    const before = { items: openNames().length, bad: bad()?.nextDueOn };
    const restore = snapshot();
    const chosen: AgentAction[] = [
      { kind: 'add_to_list', name: 'Hafermilch' },
      { kind: 'add_to_list', name: '6 Eier' },
      { kind: 'chore_done', name: 'Bad putzen' },
    ];
    for (const action of chosen) await runAgentCommand(command(action));
    await fx.settle();
    expect(openNames()).toEqual(expect.arrayContaining(['Hafermilch', 'Eier']));
    expect(bad()?.nextDueOn).not.toBe(before.bad);
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'addShoppingContributions',
      'addShoppingContributions',
      'applyChanges',
    ]);
    const planned = getData().planEntries.length;

    restore();
    await fx.settle();
    expect(openNames()).toHaveLength(before.items);
    expect(bad()?.nextDueOn).toBe(before.bad);
    expect(getData().planEntries).toHaveLength(planned);
  });

  it('AC-019: one entry fails with its reason, the others are applied', async () => {
    await fx.startEnrico();
    fx.server.failNext('add_shopping_contributions', new TransportError('permanent', '23503', 409));
    const results = [];
    for (const action of [
      { kind: 'add_to_list', name: 'Hafermilch' },
      { kind: 'chore_done', name: 'Bad putzen' },
    ] satisfies AgentAction[]) {
      const outcome = runAgentCommand(command(action)).then(
        () => 'ok',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
      await fx.settle();
      results.push(await outcome);
    }
    expect(results).toEqual([ARTICLE_GONE_MESSAGE, 'ok']);
    expect(openNames()).not.toContain('Hafermilch');
  });

  it('a calendar entry and a new restaurant planned with it are one change of the plan command', async () => {
    await fx.startEnrico();
    const entries = getData().planEntries.length;
    const touched = await runAgentCommand(
      command({
        kind: 'plan',
        target: 'restaurant',
        name: 'Lokal am Kanal',
        address: 'Paul-Lincke-Ufer 1, Berlin',
        date: '2026-11-21',
        slot: 'Abend',
        time: '19:30',
      }),
    );
    await fx.settle();
    expect(getData().planEntries).toHaveLength(entries + 1);
    const restaurant = getData().restaurants.find((row) => row.name === 'Lokal am Kanal');
    expect(restaurant?.address).toBe('Paul-Lincke-Ufer 1, Berlin');
    // Preview 28.11.: the chat shows what was made as its card.
    expect(touched).toEqual({ kind: 'restaurant', id: restaurant?.id });
    expect(
      fx.server.rows(H, 'meal_plan_entries').some((row) => row.restaurant_id === restaurant?.id),
    ).toBe(true);
  });

  it('REQ-009, stale data: once the chore was booked meanwhile, the entry is stale', async () => {
    await fx.startEnrico();
    const action: AgentAction = { kind: 'chore_done', name: 'Bad putzen' };
    const seen = resolveAction(action, agentProposalData()).seen;
    await runAgentCommand(command(action));
    await fx.settle();
    expect(recheckAction(action, seen, agentProposalData()).result).toBe('stale');
  });

  it('a Dauerposten with a new article is one change', async () => {
    await fx.startEnrico();
    await runAgentCommand(
      command({ kind: 'add_recurring', name: '2 Haferflocken extra', weekday: 6, everyWeeks: 2 }),
    );
    await fx.settle();
    const article = getData().articles.find((row) => row.name === 'Haferflocken extra');
    const item = getData().recurringItems.find((row) => row.articleId === article?.id);
    expect(item).toMatchObject({ count: 2, rule: { type: 'weekly', every: 2, weekdays: [6] } });
  });

  it('a delete runs only its own command; a row gone meanwhile is the reason', async () => {
    await fx.startEnrico();
    await runAgentCommand(command({ kind: 'add_to_list', name: 'Hafermilch' }));
    await fx.settle();
    const remove = command({ kind: 'remove_from_list', name: 'Hafermilch' });
    await runAgentCommand(remove);
    await fx.settle();
    expect(openNames()).not.toContain('Hafermilch');
    await expect(runAgentCommand(remove)).rejects.toThrow('Steht nicht mehr auf der Liste');
  });

  it('preview 28.11.: a saved card keeps its Google photo (fetch-image, then the photo path)', async () => {
    await fx.startEnrico();
    const url = 'https://lh3.googleusercontent.com/p/card';
    fx.server.setImageAddress(url, new Blob([JPEG]));
    const id = getData().restaurants[0]!.id;
    expect(await savePhotoFromAddress({ kind: 'restaurant', id }, url, prepare)).toBe(true);
    await fx.settle();
    expect(getData().restaurants.find((row) => row.id === id)?.photoPath).toMatch(
      new RegExp(`^${H}/restaurants/${id}/`),
    );
  });

  it('preview 28.11.: a photo that cannot be loaded leaves the entry without one, no error', async () => {
    await fx.startEnrico();
    const id = getData().activities[0]!.id;
    const before = getData().activities.find((row) => row.id === id)?.photoPath;
    expect(
      await savePhotoFromAddress(
        { kind: 'activity', id },
        'https://gone.example.org/x.jpg',
        prepare,
      ),
    ).toBe(false);
    expect(getData().activities.find((row) => row.id === id)?.photoPath).toBe(before);
  });

  it('offline: nothing runs', async () => {
    await fx.startEnrico();
    const add = command({ kind: 'chore_done', name: 'Bad putzen' });
    fx.environment.setOnline(false);
    await expect(runAgentCommand(add)).rejects.toThrow(OfflineError);
  });
});
