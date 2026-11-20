import { groupItems, summarizeItem, addDays, type Id } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { simulateDictation } from './assistant';
import { assignArticleArea, resolveArticle, setOffline } from './commands-household';
import { setIngredientShoppingNote } from './commands-recipes';
import {
  addIngredientToList,
  addPlannedToList,
  addShoppingItemFromText,
  createShoppingList,
  entryIdsOnLists,
  fullAreaOrder,
  moveStoreArea,
  pantryCheckRows,
  setItemChecked,
} from './commands-shopping';
import { indexById } from './queries';
import { ENRICO } from './seed/demo';
import { getData, getState, snapshot } from './store';
import {
  articleName,
  itemsOf,
  recipeById as recipe,
  TODAY,
  withDemoHousehold,
} from './test-helpers';

withDemoHousehold();

describe('shopping list commands', () => {
  it('AC-028: "2 Käse (Gouda oder Emmentaler)" becomes Käse with 2× and the note', () => {
    const listId = createShoppingList('Wochenmarkt');
    const added = addShoppingItemFromText(listId, '2 Käse (Gouda oder Emmentaler)');
    expect(added).toMatchObject({ articleName: 'Käse', createdArticle: false });
    const [item] = itemsOf(listId);
    expect(item && summarizeItem(item)).toMatchObject({
      amount: '2×',
      notes: ['Gouda oder Emmentaler'],
    });
  });

  it('AC-029: "Milch" twice gives one row with 2×; an empty field changes nothing', () => {
    const listId = createShoppingList('Wochenmarkt');
    const first = addShoppingItemFromText(listId, 'Milch');
    const second = addShoppingItemFromText(listId, 'milch');
    expect(second?.itemId).toBe(first?.itemId);
    const items = itemsOf(listId);
    expect(items).toHaveLength(1);
    expect(items[0] && summarizeItem(items[0]).amount).toBe('2×');

    const before = getData();
    expect(addShoppingItemFromText(listId, '   ')).toBeNull();
    expect(getData()).toBe(before);
  });

  it('creates an article without area and with unknown diet for a new name', () => {
    const listId = createShoppingList('Wochenmarkt');
    const added = addShoppingItemFromText(listId, 'Drachenfrucht-Sirup');
    expect(added?.createdArticle).toBe(true);
    const article = getData().articles.find((a) => a.name === 'Drachenfrucht-Sirup');
    expect(article).toMatchObject({ diet: 'unknown', isPantry: false, synonyms: [] });
    expect(article?.areaId).toBeUndefined();
    expect(resolveArticle(' Drachenfrucht-Sirup ').created).toBe(false);
  });

  it('rejects a list without name', () => {
    expect(() => createShoppingList('  ')).toThrow('Name fehlt');
  });

  it('AC-041: the simulated dictation "Milch, sechs Eier und Brot" ends up as three items', () => {
    const listId = createShoppingList('Diktat');
    for (const dictated of simulateDictation().items)
      addShoppingItemFromText(listId, dictated.text);
    const rows = itemsOf(listId).map((item) => [
      articleName(item.articleId),
      summarizeItem(item).amount,
    ]);
    expect(rows).toEqual([
      ['Milch', '1×'],
      ['Eier', '6×'],
      ['Brot', '1×'],
    ]);
  });

  it('AC-023: "Ist alle" puts Kreuzkümmel on the default list, and the snapshot undoes it', () => {
    const curry = recipe('rec-mango-curry');
    const cumin = curry.ingredients.find((ingredient) => ingredient.name === 'Kreuzkümmel');
    if (!cumin) throw new Error('Kreuzkümmel missing');
    const defaultListId = getData().household.defaultListId;
    const undo = snapshot();

    const added = addIngredientToList(curry.id, cumin.id);
    expect(added?.articleName).toBe('Kreuzkümmel');
    expect(itemsOf(defaultListId).some((item) => item.articleId === cumin.articleId)).toBe(true);

    undo();
    expect(itemsOf(defaultListId).some((item) => item.articleId === cumin.articleId)).toBe(false);
  });

  it('"Ist alle" carries the ingredient\'s default shopping note onto the list', () => {
    const pizza = recipe('rec-pizza-margherita');
    const mozzarella = pizza.ingredients.find((ingredient) => ingredient.name === 'Mozzarella');
    if (!mozzarella) throw new Error('Mozzarella missing');
    const added = addIngredientToList(pizza.id, mozzarella.id);
    const item = itemsOf(getData().household.defaultListId).find(
      (candidate) => candidate.id === added?.itemId,
    );
    expect(item?.contributions.map((contribution) => contribution.note)).toContain('Fior di Latte');
  });

  it('"Ist alle" for an unknown recipe or ingredient does nothing', () => {
    expect(addIngredientToList('rec-weg', 'x')).toBeNull();
    expect(addIngredientToList('rec-mango-curry', 'x')).toBeNull();
  });

  it('AC-033: an area assigned to an article applies on the list', () => {
    const data = getData();
    const store = data.stores.find((candidate) => candidate.id === 'store-rewe');
    const listItems = itemsOf(data.household.defaultListId);
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
    expect(entryIdsOnLists().has(entryId)).toBe(false);
    const rows = pantryCheckRows([entryId]);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Mango']?.isPantry).toBe(false);
    expect(byName['Kokosmilch']?.isPantry).toBe(false);
    expect(byName['Kokosmilch']?.sources).toEqual(['Mango-Curry (So)']);
    expect(byName['Reis']?.isPantry).toBe(true);
    expect(byName['Kreuzkümmel']?.isPantry).toBe(true);

    const defaultListId = getData().household.defaultListId;
    const kept = rows.filter((row) => !row.isPantry && row.name !== 'Mango');
    addPlannedToList(defaultListId, kept);

    const names = itemsOf(defaultListId).map((item) => articleName(item.articleId));
    expect(names).toContain('Kokosmilch');
    expect(names).not.toContain('Mango');
    expect(names).not.toContain('Reis');
    expect(names).not.toContain('Kreuzkümmel');
    expect(entryIdsOnLists().has(entryId)).toBe(true);
  });

  it('carries an ingredient’s default shopping note onto the list item', () => {
    const curry = recipe('rec-mango-curry');
    const coconut = curry.ingredients.find((ingredient) => ingredient.name === 'Kokosmilch');
    if (!coconut) throw new Error('Kokosmilch missing');
    setIngredientShoppingNote(curry.id, coconut.id, '  Bio ');

    const rows = pantryCheckRows([curryEntryId()]);
    const row = rows.find((candidate) => candidate.name === 'Kokosmilch');
    expect(row?.contributions.map((c) => c.note)).toEqual(['Bio']);

    const listId = createShoppingList('Test');
    addPlannedToList(listId, row ? [row] : []);
    const [item] = itemsOf(listId);
    expect(item && summarizeItem(item).notes).toEqual(['Bio']);

    setIngredientShoppingNote(curry.id, coconut.id, '   ');
    expect(
      recipe(curry.id).ingredients.find((i) => i.id === coconut.id)?.shoppingNote,
    ).toBeUndefined();
  });

  it('skips rows without article and unknown entries', () => {
    expect(pantryCheckRows(['plan-weg'])).toEqual([]);
    const listId = createShoppingList('Test');
    expect(
      addPlannedToList(listId, [
        { name: 'Frei', amount: '', sources: [], isPantry: false, contributions: [] },
      ]),
    ).toBe(0);
  });
});

describe('offline', () => {
  it('marks items checked or added offline and clears the marks when back online', () => {
    const listId = getData().household.defaultListId;
    const [first] = itemsOf(listId).filter((item) => !item.checked);
    if (!first) throw new Error('seed has no open item');

    setOffline(true);
    expect(getState().offline).toBe(true);
    setItemChecked(first.id, true);
    const added = addShoppingItemFromText(listId, 'Zitronen');
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
    const listId = getData().household.defaultListId;
    addShoppingItemFromText(listId, 'Zitronen');
    expect(getData().items.some((item) => item.pendingSync)).toBe(false);
  });
});
