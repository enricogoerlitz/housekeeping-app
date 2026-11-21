// Household commands (spec 0003): absences, feedback and articles on the diff path,
// votes per member over their RPC, assigning an area through the store queue, and the household,
// invitation and membership calls that wait for the server.
import { beforeEach, describe, expect, it } from 'vitest';

import { berlinToday } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  acceptInvitation,
  addFeedback,
  assignArticleArea,
  createHousehold,
  declineInvitation,
  inviteMember,
  removeAbsences,
  removeMember,
  saveAbsences,
  switchHousehold,
  toggleFeedbackVote,
} from './commands-household';
import { updateArticle } from './commands-articles';
import { setPacked } from './commands-packing';
import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { TransportError } from './transport';
import { ENRICO, NADJA } from './seed/demo';
import { getData, getState, OfflineError, snapshot } from './store';

const fx = withBackend();

describe('diff path', () => {
  it('AC-013: an absence added here reaches the other device; undo of removing it re-inserts', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const seeded = getData().absences.map((absence) => absence.id);
    const ids = (absences: { id: string }[]) =>
      absences.map((absence) => absence.id).filter((id) => !seeded.includes(id));
    saveAbsences({ replaceIds: [], memberIds: [NADJA], from: '2026-12-01', to: '2026-12-03' });
    const [id] = ids(getData().absences);
    if (!id) throw new Error('no absence');
    await fx.settle(nadja);
    expect(fx.calls).toEqual([
      {
        fn: 'applyChanges',
        args: [
          H,
          [
            {
              kind: 'insert',
              table: 'absences',
              row: { id, member_id: NADJA, from_on: '2026-12-01', to_on: '2026-12-03', note: null },
            },
          ],
        ],
      },
    ]);
    expect(ids(fx.nadjaData(nadja).absences)).toEqual([id]);

    fx.clearCalls();
    const restore = snapshot();
    removeAbsences([id]);
    expect(ids(getData().absences)).toEqual([]);
    await fx.settle(nadja);
    expect(fx.calls[0]?.args[1]).toEqual([{ kind: 'delete', table: 'absences', id }]);
    expect(ids(fx.nadjaData(nadja).absences)).toEqual([]);

    restore();
    expect(ids(getData().absences)).toEqual([id]);
    await fx.settle(nadja);
    expect(fx.calls[1]?.args[1]).toEqual([
      expect.objectContaining({ kind: 'insert', table: 'absences', row: expect.anything() }),
    ]);
    expect(fx.server.row(H, 'absences', id)).toBeDefined();
    expect(ids(fx.nadjaData(nadja).absences)).toEqual([id]);
  });

  it('feedback and article changes are one apply_changes call each', async () => {
    await fx.startEnrico();
    const feedbackId = addFeedback({ kind: 'idea', text: 'Dunkles Thema für die Liste' });
    const article = getData().articles.find((candidate) => candidate.name === 'Milch');
    if (!article) throw new Error('fixture');
    updateArticle(article.id, { isPantry: true, synonyms: ['Kuhmilch'] });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
    expect(fx.server.row(H, 'feedback', feedbackId)).toMatchObject({ author_id: ENRICO });
    expect(fx.calls[1]?.args[1]).toEqual([
      {
        kind: 'patch',
        table: 'articles',
        id: article.id,
        changes: { synonyms: ['Kuhmilch'], synonym_keys: ['kuhmilch'], is_pantry: true },
      },
    ]);
  });
});

describe('per member (rpc path)', () => {
  it('a vote goes through its RPC and undo takes it back', async () => {
    await fx.startEnrico();
    const entry = getData().feedback.find((candidate) => !candidate.votes.includes(ENRICO));
    if (!entry) throw new Error('fixture');
    const restore = snapshot();
    toggleFeedbackVote(entry.id);
    expect(getData().feedback.find((f) => f.id === entry.id)?.votes).toContain(ENRICO);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'setFeedbackVote', args: [entry.id, true] }]);
    restore();
    await fx.settle();
    expect(fx.calls[1]).toEqual({ fn: 'setFeedbackVote', args: [entry.id, false] });
    expect(getData().feedback.find((f) => f.id === entry.id)?.votes).not.toContain(ENRICO);
  });
});

describe('store queue: assign an area', () => {
  it('offline it applies locally and waits; online it is sent', async () => {
    const engine = await fx.startEnrico();
    const article = getData().articles.find((candidate) => candidate.name === 'Milch');
    const area = getData().areas.find((candidate) => candidate.id !== article?.areaId);
    if (!article || !area) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    assignArticleArea(article.id, area.id);
    expect(getData().articles.find((a) => a.id === article.id)?.areaId).toBe(area.id);
    await fx.settle(engine);
    expect(fx.calls).toEqual([]);
    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(fx.calls).toEqual([{ fn: 'assignArticleArea', args: [article.id, area.id] }]);
    expect(fx.server.row(H, 'articles', article.id)).toMatchObject({ area_id: area.id });
  });

  it('online it is sent at once', async () => {
    const engine = await fx.startEnrico();
    const article = getData().articles.find((candidate) => candidate.areaId);
    if (!article) throw new Error('fixture');
    assignArticleArea(article.id, undefined);
    await fx.settle(engine);
    expect(fx.calls).toEqual([{ fn: 'assignArticleArea', args: [article.id, null] }]);
    expect(getData().articles.find((a) => a.id === article.id)?.areaId).toBeUndefined();
  });
});

describe('household, invitation, membership (wait for the server)', () => {
  it('AC-010: creating a household sends the starter and shows it after the pull', async () => {
    await fx.startEnrico();
    const id = await createHousehold('  WG Köln ');
    expect(fx.calls.map((call) => call.fn)).toEqual(['createHousehold']);
    const [name, starter] = fx.calls[0]?.args ?? [];
    expect(name).toBe('WG Köln');
    const payload = starter as { areas: unknown[]; articles: Record<string, unknown>[] };
    expect(payload.areas[0]).toEqual({ key: 'obst-gemuese', name: 'Obst & Gemüse' });
    expect(payload.articles.find((article) => article.name === 'Möhren')).toMatchObject({
      name_key: 'moehren',
      synonym_keys: expect.arrayContaining(['karotten']),
      area: 'obst-gemuese',
      diet: 'vegan',
      is_pantry: false,
    });
    expect(getState().households[id]?.household.name).toBe('WG Köln');
    expect(getState().activeHouseholdId).toBe(H);
  });

  it('AC-009: an invalid address is refused before anything is sent', async () => {
    await fx.startEnrico();
    await expect(inviteMember('nadja@')).rejects.toThrow('Das ist keine E-Mail-Adresse');
    expect(fx.calls).toEqual([]);
  });

  it('AC-008: an invitation goes to the active household; server errors come back in German', async () => {
    await fx.startEnrico();
    await inviteMember(' Lena@Example.com ');
    expect(fx.calls).toEqual([{ fn: 'inviteMember', args: [H, 'lena@example.com'] }]);
    await expect(inviteMember('nadja@example.com')).rejects.toThrow(
      'Diese Person ist schon Mitglied',
    );
  });

  it('removing a member, accepting and declining are single calls', async () => {
    await fx.startEnrico();
    await removeMember(NADJA);
    expect(fx.calls).toEqual([{ fn: 'removeMember', args: [H, NADJA] }]);
    await expect(removeMember(ENRICO)).rejects.toThrow(
      'Du bist das letzte Mitglied des Haushalts.',
    );
    await expect(acceptInvitation('inv-x')).rejects.toThrow('Die Einladung gibt es nicht mehr.');
    await expect(declineInvitation('inv-x')).rejects.toThrow('Die Einladung gibt es nicht mehr.');
  });

  it('offline these calls fail with the offline message and send nothing', async () => {
    const engine = await fx.startEnrico();
    engine.setSimulatedOffline(true);
    await expect(createHousehold('WG Köln')).rejects.toBeInstanceOf(OfflineError);
    await expect(inviteMember('lena@example.com')).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });
});

describe('the signed-in user', () => {
  it('the current member is the signed-in user', async () => {
    await fx.startAs(NADJA);
    expect(getState().currentMemberId).toBe(NADJA);
  });

  it('without a sign-in there is no state, and commands are refused', () => {
    expect(() => getState()).toThrow();
    expect(() => addFeedback({ kind: 'idea', text: 'Etwas' })).toThrow();
    expect(() => snapshot()).toThrow('Not signed in');
  });

  it('"today" is the Berlin date', async () => {
    expect(berlinToday(new Date('2026-11-20T22:59:00Z'))).toBe('2026-11-20');
    expect(berlinToday(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-21');
    expect(berlinToday(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    await fx.startEnrico();
    expect(getState().today).toBe(berlinToday(new Date()));
  });
});

describe('household commands: input and local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-039: new feedback has status "neu"; empty feedback fails', () => {
    const id = addFeedback({ kind: 'idea', text: 'Liste nach Rezept gruppieren' });
    expect(getData().feedback.find((entry) => entry.id === id)).toMatchObject({
      status: 'new',
      authorId: ENRICO,
    });
    expect(() => addFeedback({ kind: 'idea', text: '  ' })).toThrow('Der Text fehlt.');
  });

  it('AC-002: an unknown household is ignored', () => {
    switchHousehold('hh-weg');
    expect(getState().activeHouseholdId).toBe(H);
    expect(getData().household.name).toBe('Enrico & Nadja');
  });
});

describe('absences (spec 0010, REQ-010)', () => {
  const mallorca = { from: '2027-01-01', to: '2027-01-04', note: 'Urlaub Mallorca' };
  const ours = () =>
    getData().absences.filter(
      (absence) => absence.from === '2027-01-01' || absence.note === 'Arzt',
    );

  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-033: Enrico and Nadja chosen in "Enrico & Nadja" is one absence of the household', () => {
    saveAbsences({ replaceIds: [], memberIds: [ENRICO, NADJA], ...mallorca });
    expect(ours()).toEqual([expect.objectContaining({ memberId: undefined, ...mallorca })]);
  });

  it('AC-034: one person chosen is one absence of that person', () => {
    saveAbsences({ replaceIds: [], memberIds: [NADJA], ...mallorca });
    expect(ours().map((absence) => absence.memberId)).toEqual([NADJA]);
  });

  it('AC-036: editing replaces the rows of the stripe in one change (spec 0012: the row stays)', () => {
    saveAbsences({ replaceIds: [], memberIds: [ENRICO], ...mallorca });
    const [enricos] = ours();
    saveAbsences({
      replaceIds: [enricos?.id ?? ''],
      memberIds: [ENRICO, NADJA],
      ...mallorca,
      to: '2027-01-05',
    });
    expect(ours()).toEqual([
      expect.objectContaining({ memberId: undefined, from: '2027-01-01', to: '2027-01-05' }),
    ]);
    expect(ours().map((absence) => absence.id)).toEqual([enricos?.id]);
  });

  it('AC-035, AC-044: "Bis" before "Von" or nobody chosen writes nothing; one day is fine', () => {
    const before = getData().absences;
    expect(() =>
      saveAbsences({ replaceIds: [], memberIds: [ENRICO], from: '2027-01-04', to: '2027-01-01' }),
    ).toThrow();
    expect(() =>
      saveAbsences({ replaceIds: [], memberIds: [], from: '2027-01-01', to: '2027-01-01' }),
    ).toThrow();
    expect(getData().absences).toEqual(before);
    saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO],
      from: '2027-01-01',
      to: '2027-01-01',
      note: 'Arzt',
    });
    expect(ours()).toEqual([
      expect.objectContaining({ memberId: ENRICO, from: '2027-01-01', to: '2027-01-01' }),
    ]);
  });

  it('AC-037: removing a row deletes exactly its absences', () => {
    saveAbsences({ replaceIds: [], memberIds: [ENRICO], ...mallorca });
    saveAbsences({ replaceIds: [], memberIds: [NADJA], ...mallorca, to: '2027-01-07' });
    const count = getData().absences.length;
    const [first] = ours();
    removeAbsences([first?.id ?? '']);
    expect(getData().absences).toHaveLength(count - 1);
    expect(ours()).toHaveLength(1);
  });
});

describe('absences with a packing list (spec 0012, REQ-002, REQ-008)', () => {
  const trip = { from: '2027-01-01', to: '2027-01-07', note: 'Sommer' };
  const bagId = (name: string) => {
    const found = getData().packingBags.find((bag) => bag.name === name);
    if (!found) throw new Error(`fixture: ${name}`);
    return found.id;
  };
  const listOf = (absenceId: string) => {
    const listBags = getData().packingListBags.filter((bag) => bag.absenceId === absenceId);
    const items = getData().packingItems.filter((item) =>
      listBags.some((bag) => bag.id === item.listBagId),
    );
    return { listBags, items };
  };

  it('AC-011: Strand and Kulturbeutel at a household absence: 21 Packstücke in one call, T-Shirts 7×', async () => {
    await fx.startEnrico();
    const [id] = saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO, NADJA],
      ...trip,
      bagIds: [bagId('Strand'), bagId('Kulturbeutel')],
    });
    if (!id) throw new Error('no absence');
    const { listBags, items } = listOf(id);
    expect(listBags.map((bag) => [bag.name, bag.memberId])).toEqual([
      ['Strand', undefined],
      ['Kulturbeutel', NADJA],
    ]);
    expect(items).toHaveLength(21);
    expect(items.find((item) => item.name === 'T-Shirts')?.quantity).toBe(7);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.server.rows(H, 'packing_list_bags').filter((r) => r.absence_id === id)).toHaveLength(
      2,
    );
    expect(
      fx.server
        .rows(H, 'packing_items')
        .find(
          (row) =>
            row.name === 'T-Shirts' &&
            row.quantity === 7 &&
            listBags.some((bag) => bag.id === row.list_bag_id),
        ),
    ).toBeDefined();
  });

  it('AC-012: without a chosen bag there is no packing list', async () => {
    await fx.startEnrico();
    const [id] = saveAbsences({ replaceIds: [], memberIds: [ENRICO], ...trip, bagIds: [] });
    expect(listOf(id ?? '').listBags).toEqual([]);
  });

  it('AC-014: two separate absences get their own list: T-Shirts 4× and 7×', async () => {
    await fx.startEnrico();
    const [enricos] = saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO],
      ...trip,
      to: '2027-01-04',
      bagIds: [bagId('Strand')],
    });
    const [nadjas] = saveAbsences({
      replaceIds: [],
      memberIds: [NADJA],
      ...trip,
      bagIds: [bagId('Strand')],
    });
    const tshirts = (absenceId: string | undefined) =>
      listOf(absenceId ?? '').items.find((item) => item.name === 'T-Shirts')?.quantity;
    expect([tshirts(enricos), tshirts(nadjas)]).toEqual([4, 7]);
  });

  it('AC-015: refused by the server: neither absence nor packing list, and the hint', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const before = getData().packingItems.length;
    fx.server.failNext('apply_changes', new TransportError('permanent', '23514', 400));
    const [id] = saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO, NADJA],
      ...trip,
      bagIds: [bagId('Strand')],
    });
    await fx.settle();
    expect(getData().absences.some((absence) => absence.id === id)).toBe(false);
    expect(getData().packingItems).toHaveLength(before);
    expect(fx.server.row(H, 'absences', id ?? '')).toBeUndefined();
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('AC-037: a shorter absence shows open "je Tag" at once as 5×, packed ones stay 7×', async () => {
    const engine = await fx.startEnrico();
    const [id] = saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO, NADJA],
      ...trip,
      bagIds: [bagId('Wintersport')],
    });
    await fx.settle(engine);
    const socks = listOf(id ?? '').items.find((item) => item.name === 'Socken');
    if (!socks || !id) throw new Error('fixture');
    setPacked(socks.id, true);
    await fx.settle(engine);
    fx.clearCalls();
    saveAbsences({ replaceIds: [id], memberIds: [ENRICO, NADJA], ...trip, to: '2027-01-05' });
    const quantity = (name: string) =>
      listOf(id).items.find((item) => item.name === name)?.quantity;
    expect([quantity('Skiunterwäsche'), quantity('Socken'), quantity('Handschuhe')]).toEqual([
      5, 7, 2,
    ]);
    await fx.settle(engine);
    expect(fx.calls).toEqual([
      {
        fn: 'applyChanges',
        args: [H, [{ kind: 'patch', table: 'absences', id, changes: { to_on: '2027-01-05' } }]],
      },
    ]);
    expect([quantity('Skiunterwäsche'), quantity('Socken')]).toEqual([5, 7]);
  });

  it('AC-039: changing the people keeps the absence and its packing list with what is packed', async () => {
    const engine = await fx.startEnrico();
    const [id] = saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO],
      ...trip,
      bagIds: [bagId('Strand'), bagId('Kulturbeutel')],
    });
    await fx.settle(engine);
    if (!id) throw new Error('fixture');
    const items = listOf(id).items.slice(0, 5);
    for (const item of items) setPacked(item.id, true);
    await fx.settle(engine);

    expect(saveAbsences({ replaceIds: [id], memberIds: [ENRICO, NADJA], ...trip })).toEqual([id]);
    await fx.settle(engine);
    expect(getData().absences.find((absence) => absence.id === id)?.memberId).toBeUndefined();
    expect(listOf(id).items).toHaveLength(21);
    expect(listOf(id).items.filter((item) => item.packed)).toHaveLength(5);

    expect(saveAbsences({ replaceIds: [id], memberIds: [NADJA], ...trip })).toEqual([id]);
    await fx.settle(engine);
    expect(fx.server.row(H, 'absences', id)).toMatchObject({ member_id: NADJA });
    expect(listOf(id).items.filter((item) => item.packed)).toHaveLength(5);
  });

  it('decision 8: two rows becoming one move their bags along before the removal; same bag kept apart', async () => {
    const engine = await fx.startEnrico();
    const [enricos] = saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO],
      ...trip,
      bagIds: [bagId('Strand')],
    });
    const [nadjas] = saveAbsences({
      replaceIds: [],
      memberIds: [NADJA],
      ...trip,
      bagIds: [bagId('Strand'), bagId('Kulturbeutel')],
    });
    await fx.settle(engine);
    if (!enricos || !nadjas) throw new Error('fixture');
    fx.clearCalls();
    const written = saveAbsences({
      replaceIds: [enricos, nadjas],
      memberIds: [ENRICO, NADJA],
      ...trip,
    });
    expect(written).toHaveLength(1);
    const [kept] = written;
    await fx.settle(engine);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    const ops = (fx.calls[0]?.args[1] ?? []) as { kind: string; table: string }[];
    expect(ops.map((op) => `${op.kind} ${op.table}`)).toEqual([
      'patch absences',
      'patch packing_list_bags',
      'patch packing_list_bags',
      'delete absences',
    ]);
    const { listBags, items } = listOf(kept ?? '');
    expect(listBags.map((bag) => bag.name).sort()).toEqual(['Kulturbeutel', 'Strand', 'Strand']);
    expect(listBags.filter((bag) => bag.bagId === bagId('Strand'))).toHaveLength(1);
    expect(items).toHaveLength(12 + 12 + 9);
    expect(
      fx.server.rows(H, 'packing_list_bags').filter((r) => r.absence_id === kept),
    ).toHaveLength(3);
  });
});
