// Spec 0062 "Rezept anlegen und mit KI ändern": the way the one field of a new recipe, restaurant
// or activity suggests (REQ-002, REQ-008).
import { describe, expect, it } from 'vitest';

import { RECIPE_CREATE_PATHS, PLACE_CREATE_PATHS, suggestedCreatePath } from './create-path';

const recipe = (text: string) => suggestedCreatePath(text, RECIPE_CREATE_PATHS);
const place = (text: string) => suggestedCreatePath(text, PLACE_CREATE_PATHS);

describe('the suggested way of a new recipe (spec 0062, REQ-002)', () => {
  it('AC-003: a name of one to three words is searched on the web', () => {
    expect(recipe('Spaghetti Bolognese')).toBe('web');
    expect(recipe('Lasagne')).toBe('web');
    expect(recipe('Pasta mit Pilzen')).toBe('web');
  });

  it('AC-004: a sentence from four words on is written by the AI', () => {
    expect(recipe('Meatball Pasta scharf ohne Sahne')).toBe('ai');
    expect(recipe('Meatball Pasta, scharf, ohne Sahne')).toBe('ai');
  });

  it('AC-005: a number makes it a wish for the AI', () => {
    expect(recipe('Pasta für 4')).toBe('ai');
  });

  it('AC-006: a link is read by the AI', () => {
    expect(recipe('https://www.chefkoch.de/rezepte/123')).toBe('ai');
    expect(recipe('chefkoch.de/rezepte/123')).toBe('ai');
  });

  it('AC-008: blank text suggests nothing', () => {
    expect(recipe('')).toBeUndefined();
    expect(recipe('   ')).toBeUndefined();
  });

  it('counts only parts with a letter or a digit as words', () => {
    expect(recipe('Spaghetti – Bolognese !')).toBe('web');
  });

  it('without the AI there is only "Anlegen"', () => {
    expect(suggestedCreatePath('Meatball Pasta scharf ohne Sahne', ['create'])).toBe('create');
  });
});

describe('the suggested way of a new restaurant or activity (spec 0062, REQ-008)', () => {
  it('AC-020: up to four words are searched on the web', () => {
    expect(place('Coccodrillo')).toBe('web');
    expect(place('Kletterhalle Berlin Mitte Nord')).toBe('web');
  });

  it('AC-022: more than four words are a name to create', () => {
    expect(place('Pizzeria am Kanal mit Garten')).toBe('create');
  });

  it('AC-023: a map link fills the form', () => {
    expect(place('https://maps.app.goo.gl/abc123')).toBe('create');
  });

  it('a number does not make a place a wish', () => {
    expect(place('Pizzeria 2000')).toBe('web');
  });

  it('blank text suggests nothing', () => {
    expect(place(' ')).toBeUndefined();
  });
});
