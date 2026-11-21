import {
  addDays,
  entryIdsOnList,
  groupItems,
  originSummary,
  resolveShoppingStore,
  summarizeItem,
  type Id,
  type ShoppingItem,
} from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { simulateDictation } from './assistant';
import { assignArticleArea, resolveArticle, setOffline } from './commands-household';
import { setIngredientShoppingNote } from './commands-recipes';
import {
  addIngredientToList,
  addPlannedToList,
  addShoppingItemFromText,
  adjustItemCount,
  chooseShoppingStore,
  clearCheckedItems,
  clearShoppingList,
  fullAreaOrder,
  ITEM_NOTE_MAX_LENGTH,
  moveStoreArea,
  pantryCheckRows,
  removeShoppingItem,
  setItemChecked,
  setItemNote,
} from './commands-shopping';
import { indexById } from './queries';
import { DEMO_HOUSEHOLD_ID, ENRICO, TEST_HOUSEHOLD_ID } from './seed/demo';
import { getData, getState, snapshot } from './store';
import {
  articleName,
  itemsOf,
  recipeById as recipe,
  TODAY,
  withDemoHousehold,
} from './test-helpers';

withDemoHousehold();

const openItem = (name: string): ShoppingItem | undefined =>
  itemsOf().find((item) => !item.checked && articleName(item.articleId) === name);

describe('shopping list commands', () => {
  it('AC-028: "2 Käse (Gouda oder Emmentaler)" becomes Käse with 2× and the note', () => {
    clearShoppingList();
    const added = addShoppingItemFromText('2 Käse (Gouda oder Emmentaler)');
    expect(added).toMatchObject({ articleName: 'Käse', createdArticle: false });
    const item = itemsOf().find((candidate) => candidate.id === added?.itemId);
    expect(item && summarizeItem(item)).toMatchObject({
      amount: '2×',
      notes: ['Gouda oder Emmentaler'],
    });
  });

  it('AC-029: "Milch" twice gives one row with 2×; an empty field changes nothing', () => {
    const first = addShoppingItemFromText('Joghurt');
    const second = addShoppingItemFromText('joghurt');
    expect(second?.itemId).toBe(first?.itemId);
    const items = itemsOf().filter((item) => articleName(item.articleId) === 'Joghurt');
    expect(items).toHaveLength(1);
    expect(items[0] && summarizeItem(items[0]).amount).toBe('2×');

    const before = getData();
    expect(addShoppingItemFromText('   ')).toBeNull();
    expect(getData()).toBe(before);
  });

  it('creates an article without area and with unknown diet for a new name', () => {
    const added = addShoppingItemFromText('Drachenfrucht-Sirup');
    expect(added?.createdArticle).toBe(true);
    const article = getData().articles.find((a) => a.name === 'Drachenfrucht-Sirup');
    expect(article).toMatchObject({ diet: 'unknown', isPantry: false, synonyms: [] });
    expect(article?.areaId).toBeUndefined();
    expect(resolveArticle(' Drachenfrucht-Sirup ').created).toBe(false);
  });

  it('AC-041: the simulated dictation "Milch, sechs Eier und Brot" ends up as three items', () => {
    clearShoppingList();
    for (const dictated of simulateDictation().items) addShoppingItemFromText(dictated.text);
    const rows = itemsOf().map((item) => [articleName(item.articleId), summarizeItem(item).amount]);
    expect(rows).toEqual([
      ['Milch', '1×'],
      ['Eier', '6×'],
      ['Brot', '1×'],
    ]);
  });

  it('AC-023: "Ist alle" puts Kreuzkümmel on the list, and the snapshot undoes it', () => {
    const curry = recipe('rec-mango-curry');
    const cumin = curry.ingredients.find((ingredient) => ingredient.name === 'Kreuzkümmel');
    if (!cumin) throw new Error('Kreuzkümmel missing');
    const undo = snapshot();

    const added = addIngredientToList(curry.id, cumin.id);
    expect(added?.articleName).toBe('Kreuzkümmel');
    expect(itemsOf().some((item) => item.articleId === cumin.articleId)).toBe(true);

    undo();
    expect(itemsOf().some((item) => item.articleId === cumin.articleId)).toBe(false);
  });

  it('"Ist alle" carries the ingredient\'s default shopping note onto the list', () => {
    const pizza = recipe('rec-pizza-margherita');
    const mozzarella = pizza.ingredients.find((ingredient) => ingredient.name === 'Mozzarella');
    if (!mozzarella) throw new Error('Mozzarella missing');
    const added = addIngredientToList(pizza.id, mozzarella.id);
    const item = itemsOf().find((candidate) => candidate.id === added?.itemId);
    expect(item?.contributions.map((contribution) => contribution.note)).toContain('Fior di Latte');
  });

  it('"Ist alle" for an unknown recipe or ingredient does nothing', () => {
    expect(addIngredientToList('rec-weg', 'x')).toBeNull();
    expect(addIngredientToList('rec-mango-curry', 'x')).toBeNull();
  });

  it('AC-033: an area assigned to an article applies on the list', () => {
    const data = getData();
    const store = data.stores.find((candidate) => candidate.id === 'store-rewe');
    const listItems = itemsOf();
    const before = groupItems(listItems, indexById(data.articles), data.areas, store);
    expect(before.find((group) => group.key === 'none')?.items.map((i) => i.articleId)).toContain(
      'art-geschenkpapier',
    );

    assignArticleArea('art-geschenkpapier', 'area-haushalt');
    const after = getData();
    const groups = groupItems(listItems, indexById(after.articles), after.areas, store);
    expect(groups.find((group) => group.key === 'none')).toBeUndefined();
    expect(
      groups.find((group) => group.title === 'Haushalt & Reinigung')?.items.map((i) => i.articleId),
    ).toEqual(['art-geschenkpapier']);
  });

  it('AC-034: moving "Getränke" to the front makes it the first area of Rewe Südstadt', () => {
    moveStoreArea('store-rewe', 'area-getraenke', 0);
    const store = getData().stores.find((candidate) => candidate.id === 'store-rewe');
    expect(store && fullAreaOrder(store)[0]).toBe('area-getraenke');
    expect(store?.areaOrder.filter((id) => id === 'area-getraenke')).toHaveLength(1);
  });
});

describe('pantry check', () => {
  function curryEntryId(): Id {
    const entry = getData().planEntries.find(
      (candidate) =>
        candidate.recipeId === 'rec-mango-curry' && candidate.date === addDays(TODAY, 2),
    );
    if (!entry) throw new Error('planned curry missing');
    return entry.id;
  }

  it('AC-031: Mango and Kokosmilch go on the list, Reis and Kreuzkümmel start as pantry', () => {
    const entryId = curryEntryId();
    expect(entryIdsOnList(getData().items).has(entryId)).toBe(false);
    const rows = pantryCheckRows([entryId]);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Mango']?.isPantry).toBe(false);
    expect(byName['Kokosmilch']?.isPantry).toBe(false);
    expect(byName['Kokosmilch']?.sources).toEqual(['Mango-Curry (So)']);
    expect(byName['Reis']?.isPantry).toBe(true);
    expect(byName['Kreuzkümmel']?.isPantry).toBe(true);
    const kept = rows.filter((row) => !row.isPantry && row.name !== 'Mango');
    addPlannedToList(kept);

    const names = itemsOf().map((item) => articleName(item.articleId));
    expect(names).toContain('Kokosmilch');
    expect(names).not.toContain('Mango');
    expect(names).not.toContain('Reis');
    expect(names).not.toContain('Kreuzkümmel');
    expect(entryIdsOnList(getData().items).has(entryId)).toBe(true);
  });

  it('carries an ingredient’s default shopping note onto the list item', () => {
    const curry = recipe('rec-mango-curry');
    const coconut = curry.ingredients.find((ingredient) => ingredient.name === 'Kokosmilch');
    if (!coconut) throw new Error('Kokosmilch missing');
    setIngredientShoppingNote(curry.id, coconut.id, '  Bio ');

    const rows = pantryCheckRows([curryEntryId()]);
    const row = rows.find((candidate) => candidate.name === 'Kokosmilch');
    expect(row?.contributions.map((c) => c.note)).toEqual(['Bio']);

    clearShoppingList();
    addPlannedToList(row ? [row] : []);
    const [item] = itemsOf();
    expect(item && summarizeItem(item).notes).toEqual(['Bio']);

    setIngredientShoppingNote(curry.id, coconut.id, '   ');
    expect(
      recipe(curry.id).ingredients.find((i) => i.id === coconut.id)?.shoppingNote,
    ).toBeUndefined();
  });

  it('skips rows without article and unknown entries', () => {
    expect(pantryCheckRows(['plan-weg'])).toEqual([]);
    expect(
      addPlannedToList([
        { name: 'Frei', amount: '', sources: [], isPantry: false, contributions: [] },
      ]),
    ).toBe(0);
  });
});

describe('offline', () => {
  it('marks items checked or added offline and clears the marks when back online', () => {
    const [first] = itemsOf().filter((item) => !item.checked);
    if (!first) throw new Error('seed has no open item');

    setOffline(true);
    expect(getState().offline).toBe(true);
    setItemChecked(first.id, true);
    const added = addShoppingItemFromText('Zitronen');
    const pending = getData().items.filter((item) => item.pendingSync);
    expect(pending.map((item) => item.id).sort()).toEqual([first.id, added?.itemId].sort());
    expect(getData().items.find((item) => item.id === first.id)).toMatchObject({
      checked: true,
      checkedBy: ENRICO,
    });

    setOffline(false);
    expect(getState().offline).toBe(false);
    expect(getData().items.some((item) => item.pendingSync)).toBe(false);
  });

  it('does not mark changes made online', () => {
    addShoppingItemFromText('Zitronen');
    expect(getData().items.some((item) => item.pendingSync)).toBe(false);
  });
});

describe("the household's shopping list (spec 0006, ADR-0012)", () => {
  it("REQ-001: the list is the household's items; there is no list row", () => {
    const data = getData();
    expect(data).not.toHaveProperty('lists');
    expect(data.household).not.toHaveProperty('defaultListId');
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('AC-023 / REQ-001: "Ist alle" lands in the household\'s items', () => {
    const curry = recipe('rec-mango-curry');
    const cumin = curry.ingredients.find((ingredient) => ingredient.name === 'Kreuzkümmel');
    if (!cumin) throw new Error('fixture');
    const added = addIngredientToList(curry.id, cumin.id);
    expect(itemsOf().some((item) => item.id === added?.itemId)).toBe(true);
  });
});

describe('+ and − (REQ-003)', () => {
  /** An open item with one contribution from the plan, counted 1×. */
  function fromPlanOnce(): ShoppingItem {
    const item = itemsOf().find(
      (candidate) =>
        !candidate.checked &&
        candidate.contributions.length === 1 &&
        candidate.contributions[0]?.source.kind === 'recipe' &&
        candidate.contributions[0]?.count === 1 &&
        candidate.contributions[0]?.qty === undefined,
    );
    if (!item) throw new Error('fixture: no item 1× from the plan');
    return item;
  }
  const current = (id: Id) => getData().items.find((item) => item.id === id);

  it('AC-014: + adds a share "von Hand" next to the plan', () => {
    const item = fromPlanOnce();
    const label =
      item.contributions[0]?.source.kind === 'recipe' ? item.contributions[0].source.label : '';
    expect(adjustItemCount(item.id, 1)).toEqual({ count: 2, removed: false });
    const after = current(item.id);
    expect(after && summarizeItem(after).amount).toBe('2×');
    expect(after && originSummary(after)).toBe(`${label}: 1× · von Hand: 1×`);
  });

  it('AC-015: − takes the share "von Hand" first, then removes the item; the snapshot brings it back', () => {
    const item = fromPlanOnce();
    adjustItemCount(item.id, 1);
    expect(adjustItemCount(item.id, -1)).toEqual({ count: 1, removed: false });
    expect(current(item.id)?.contributions).toEqual(item.contributions);

    const undo = snapshot();
    expect(adjustItemCount(item.id, -1)).toEqual({ count: 0, removed: true });
    expect(current(item.id)).toBeUndefined();
    undo();
    expect(current(item.id)).toEqual(item);
  });

  it('AC-018: an item with a quantity has no + and −; an unknown item neither', () => {
    const carrots = openItem('Möhren');
    if (!carrots) throw new Error('fixture');
    const before = getData();
    expect(adjustItemCount(carrots.id, 1)).toBeNull();
    expect(adjustItemCount('item-weg', -1)).toBeNull();
    expect(getData()).toBe(before);
  });

  it('+ stops at 99×', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    for (let count = 2; count <= 99; count += 1) adjustItemCount(milk.id, 1);
    expect(current(milk.id) && summarizeItem(current(milk.id) as ShoppingItem).amount).toBe('99×');
    expect(adjustItemCount(milk.id, 1)).toBeNull();
  });
});

describe('Zusatz, entfernen, leeren (REQ-004, REQ-006)', () => {
  it('AC-021: the note goes on every contribution of the item; clearing it removes the brackets', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    adjustItemCount(milk.id, 1);
    addPlannedToList(
      pantryCheckRows([], [{ recipeId: 'rec-pfannkuchen', portions: 4 }]).filter(
        (row) => row.name === 'Milch',
      ),
    );
    setItemNote(milk.id, '  laktosefrei ');
    const noted = getData().items.find((item) => item.id === milk.id);
    expect(noted?.contributions.map((contribution) => contribution.note)).toEqual(
      noted?.contributions.map(() => 'laktosefrei'),
    );
    expect(noted && summarizeItem(noted).notes).toEqual(['laktosefrei']);

    setItemNote(milk.id, null);
    const cleared = getData().items.find((item) => item.id === milk.id);
    expect(cleared?.contributions.every((contribution) => contribution.note === undefined)).toBe(
      true,
    );
    setItemNote(milk.id, 'x');
    setItemNote(milk.id, '   ');
    expect(
      getData()
        .items.find((item) => item.id === milk.id)
        ?.contributions.every((contribution) => contribution.note === undefined),
    ).toBe(true);
  });

  it('AC-022: a note longer than 200 characters is refused and changes nothing', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    const before = getData();
    expect(ITEM_NOTE_MAX_LENGTH).toBe(200);
    expect(() => setItemNote(milk.id, 'x'.repeat(201))).toThrow('Höchstens 200 Zeichen');
    expect(getData()).toBe(before);
    setItemNote(milk.id, 'x'.repeat(200));
    expect(openItem('Milch')?.contributions[0]?.note).toHaveLength(200);
  });

  it('AC-025: removing takes the item with all its contributions; the snapshot brings it back', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    const undo = snapshot();
    removeShoppingItem(milk.id);
    expect(openItem('Milch')).toBeUndefined();
    undo();
    expect(openItem('Milch')).toEqual(milk);
  });

  it('AC-035 / AC-039: "Liste leeren" removes open and checked items; the plan is selectable again', () => {
    const all = itemsOf();
    expect(all.some((item) => item.checked)).toBe(true);
    expect(entryIdsOnList(all).size).toBeGreaterThan(0);
    const undo = snapshot();
    expect(clearShoppingList()).toBe(all.length);
    expect(itemsOf()).toEqual([]);
    expect(entryIdsOnList(getData().items).size).toBe(0);
    expect(clearShoppingList()).toBe(0);
    undo();
    expect(itemsOf()).toEqual(all);
  });

  it('"Erledigt leeren" works on the one list without naming it', () => {
    const done = itemsOf().filter((item) => item.checked);
    expect(clearCheckedItems()).toBe(done.length);
    expect(itemsOf().some((item) => item.checked)).toBe(false);
    expect(clearCheckedItems()).toBe(0);
  });
});

describe('pantry check for any recipe (REQ-010, for specs 0008/0009)', () => {
  it('AC-058: a recipe with its portions and variant, origin without a day', () => {
    const curry = recipe('rec-mango-curry');
    const tofu = curry.variants.find((variant) => variant.name === 'mit Tofu');
    if (!tofu) throw new Error('fixture');
    const rows = pantryCheckRows(
      [],
      [{ recipeId: curry.id, portions: 6, variants: [{ variantId: tofu.id, portions: 6 }] }],
    );
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Kokosmilch']).toMatchObject({ amount: '600 ml', sources: ['Mango-Curry'] });
    expect(byName['Räuchertofu']).toMatchObject({ amount: '600 g' });
    expect(byName['Hähnchenbrust']).toBeUndefined();
    expect(byName['Reis']?.isPantry).toBe(true);

    clearShoppingList();
    addPlannedToList(rows.filter((row) => row.name === 'Kokosmilch'));
    const [item] = itemsOf();
    expect(item?.contributions[0]?.source).toEqual({
      kind: 'recipe',
      recipeId: curry.id,
      label: 'Mango-Curry',
    });
    expect(entryIdsOnList(getData().items).size).toBe(0);
  });

  it('AC-059: an article open "von Hand" gets the recipe’s share in the same row', () => {
    clearShoppingList();
    addShoppingItemFromText('Mango');
    const rows = pantryCheckRows([], [{ recipeId: 'rec-mango-curry', portions: 4 }]);
    addPlannedToList(rows.filter((row) => row.name === 'Mango'));
    const mangos = itemsOf().filter((item) => articleName(item.articleId) === 'Mango');
    expect(mangos).toHaveLength(1);
    expect(mangos[0] && originSummary(mangos[0])).toBe('von Hand: 1× · Mango-Curry: 1×');
  });

  it('plan entries and chosen recipes together are one pantry check (AC-053)', () => {
    const entry = getData().planEntries.find(
      (candidate) =>
        candidate.recipeId === 'rec-mango-curry' && candidate.date === addDays(TODAY, 2),
    );
    if (!entry) throw new Error('fixture');
    const rows = pantryCheckRows([entry.id], [{ recipeId: 'rec-mango-curry', portions: 4 }]);
    expect(rows.find((row) => row.name === 'Kokosmilch')?.sources).toEqual([
      'Mango-Curry (So)',
      'Mango-Curry',
    ]);
    expect(pantryCheckRows([], [{ recipeId: 'rec-weg', portions: 4 }])).toEqual([]);
  });
});

describe('store in "Einkaufen" (REQ-007)', () => {
  const shown = () => {
    const state = getState();
    const data = getData();
    return resolveShoppingStore(
      data.stores,
      state.storeChoices?.[state.activeHouseholdId],
      data.household.defaultStoreId,
    )?.id;
  };

  it('AC-040 / AC-042: the default store until one is chosen on the device, per household', () => {
    expect(shown()).toBe('store-rewe');
    chooseShoppingStore('store-dm');
    expect(shown()).toBe('store-dm');
    expect(getState().storeChoices).toEqual({ [DEMO_HOUSEHOLD_ID]: 'store-dm' });
    chooseShoppingStore(null);
    expect(shown()).toBeUndefined();
    expect(getState().storeChoices?.[TEST_HOUSEHOLD_ID]).toBeUndefined();
  });
});
