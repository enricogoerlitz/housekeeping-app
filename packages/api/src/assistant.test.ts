import { describe, expect, it } from 'vitest';

import {
  AI_NO_ANSWER,
  AI_SAMPLE_NOTE,
  aiSearch,
  applyProposal,
  askAssistant,
  assistantExamples,
  dictatedItems,
} from './assistant';
import { getData } from './store';
import { withDemoHousehold } from './test-helpers';

withDemoHousehold();

const curry = () => getData().recipes.find((recipe) => recipe.id === 'rec-mango-curry');

describe('askAssistant', () => {
  it('AC-040: "Mach das vegan und für 6 Personen" proposes changes; accepting sets 6 portions', () => {
    expect(curry()?.servings).toBe(4);
    const reply = askAssistant('Mach das vegan und für 6 Personen', {
      recipeId: 'rec-mango-curry',
    });
    const proposal = reply.proposal;
    if (!proposal) throw new Error('no proposal');
    expect(proposal.note).toBe(AI_SAMPLE_NOTE);
    expect(AI_SAMPLE_NOTE).toBe('Beispielantwort – KI ist noch nicht angeschlossen');
    expect(proposal.parts[0]).toMatchObject({ label: 'Portionen', before: '4', after: '6' });
    // Only changes are listed: the vegan Räuchertofu is not proposed for replacement.
    expect(proposal.parts.map((part) => part.before)).not.toContain('400 g Räuchertofu');

    expect(
      applyProposal(
        proposal,
        proposal.parts.map((part) => part.id),
      ),
    ).toBe(proposal.parts.length);
    expect(curry()?.servings).toBe(6);
  });

  it('applies only the chosen parts of a proposal', () => {
    const proposal = askAssistant('Mach das vegan und für 6 Personen', {
      recipeId: 'rec-mango-curry',
    }).proposal;
    if (!proposal) throw new Error('no proposal');
    const before = curry()?.ingredients;
    const servingsPart = proposal.parts.find((part) => part.label === 'Portionen');
    expect(applyProposal(proposal, servingsPart ? [servingsPart.id] : [])).toBe(1);
    expect(curry()?.servings).toBe(6);
    expect(curry()?.ingredients).toEqual(before);
    expect(applyProposal(proposal, [])).toBe(0);
  });

  it('asks to open a recipe first when the vegan request comes without one', () => {
    const reply = askAssistant('Mach das vegan und für 6 Personen', {});
    expect(reply.proposal).toBeUndefined();
    expect(reply.text).toBe('Öffne zuerst ein Rezept, dann kann ich es anpassen.');
  });

  it('AC-043: a request without prepared answer gets the "only samples" reply', () => {
    const before = getData();
    const reply = askAssistant('Was ist der Sinn des Lebens?', {});
    expect(reply).toEqual({ text: AI_NO_ANSWER });
    expect(AI_NO_ANSWER).toContain('Im Dummy sind nur die Beispielanfragen hinterlegt');
    expect(getData()).toBe(before);
  });

  it('answers "Was koche ich heute?" with the dishes of today, marking leftovers, without changing anything', () => {
    const reply = askAssistant('was koche ich heute?', {});
    expect(reply.text).toBe('Für heute ist geplant: Mango-Curry (Reste), Lasagne.');
    expect(reply.proposal).toBeUndefined();
  });

  it('offers recipe examples inside a recipe and general ones elsewhere', () => {
    expect(assistantExamples({ recipeId: 'rec-mango-curry' })).toContain(
      'Mach das vegan und für 6 Personen',
    );
    expect(assistantExamples({})).not.toContain('Mach das vegan und für 6 Personen');
  });
});

describe('aiSearch', () => {
  it('turns a free request into chips and searches with the normal filters', () => {
    const result = aiSearch('was schnelles vegetarisches mit tofu');
    expect(result.chips.map((chip) => chip.id)).toEqual(['fast', 'vegetarian', 'term:tofu']);
    expect(result.note).toBe(AI_SAMPLE_NOTE);
    const titles = result.results.map(
      (hit) => getData().recipes.find((recipe) => recipe.id === hit.recipeId)?.title,
    );
    expect(titles).toContain('Mango-Curry');
  });

  it('searches again without a chip the user removed', () => {
    const result = aiSearch('was schnelles mit tofu', ['term:tofu']);
    expect(result.trace).toBe('2 Runden · gesucht: alle Rezepte');
  });
});

describe('dictatedItems', () => {
  it('AC-028: "Milch, sechs Eier und Brot" becomes three proposal rows', () => {
    const items = dictatedItems('Milch, sechs Eier und Brot.');
    expect(items.map(({ text, name, meta }) => ({ text, name, meta }))).toEqual([
      { text: 'Milch', name: 'Milch', meta: undefined },
      { text: '6 Eier', name: 'Eier', meta: '6×' },
      { text: 'Brot', name: 'Brot', meta: undefined },
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(3);
  });

  it('shows a measured amount and keeps the note in the text', () => {
    expect(dictatedItems('500 g Möhren (bio)')).toMatchObject([
      { text: '500 g Möhren (bio)', name: 'Möhren', meta: '500 g' },
    ]);
  });

  it('nothing said, nothing proposed', () => {
    expect(dictatedItems(' ')).toEqual([]);
  });
});
