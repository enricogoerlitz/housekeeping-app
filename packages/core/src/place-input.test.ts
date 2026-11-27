import { describe, expect, it } from 'vitest';

import { insertedText, nextEmptyField, recognizePaste, recognizePlaceText } from './place-input';

describe('recognizePlaceText: what the clipboard holds (spec 0042, REQ-003)', () => {
  it('AC-005: a Google short link is a map link', () => {
    expect(recognizePlaceText('https://maps.app.goo.gl/abc')).toEqual({
      kind: 'maps',
      url: 'https://maps.app.goo.gl/abc',
    });
  });

  it('AC-005: the map link out of a shared text "Name + link"', () => {
    expect(recognizePlaceText('Bless\nhttps://maps.app.goo.gl/abc ')).toEqual({
      kind: 'maps',
      url: 'https://maps.app.goo.gl/abc',
    });
    expect(
      recognizePlaceText('https://www.google.com/maps/place/Bless/@52.52,13.40,17z'),
    ).toMatchObject({ kind: 'maps' });
    expect(recognizePlaceText('https://maps.apple.com/?q=Bless&ll=52.5,13.4')).toMatchObject({
      kind: 'maps',
    });
  });

  it('AC-006: a street with postcode and city is an address; lines become commas', () => {
    expect(recognizePlaceText('Oranienburger Str. 45, 10117 Berlin')).toEqual({
      kind: 'address',
      text: 'Oranienburger Str. 45, 10117 Berlin',
    });
    expect(recognizePlaceText(' Oranienburger Str. 45\n10117 Berlin\n\nDeutschland ')).toEqual({
      kind: 'address',
      text: 'Oranienburger Str. 45, 10117 Berlin, Deutschland',
    });
  });

  it('REQ-003: a web address is a website, with https:// in front when it has none', () => {
    expect(recognizePlaceText('https://bless-berlin.de/menu')).toEqual({
      kind: 'web',
      url: 'https://bless-berlin.de/menu',
    });
    expect(recognizePlaceText('www.bless-berlin.de')).toEqual({
      kind: 'web',
      url: 'https://www.bless-berlin.de',
    });
    expect(recognizePlaceText('bless-berlin.de')).toEqual({
      kind: 'web',
      url: 'https://bless-berlin.de',
    });
    expect(recognizePlaceText('Schau mal: https://bless-berlin.de')).toEqual({
      kind: 'web',
      url: 'https://bless-berlin.de',
    });
  });

  it('AC-007: empty or nothing recognisable is nothing', () => {
    expect(recognizePlaceText('')).toEqual({ kind: 'none' });
    expect(recognizePlaceText('   \n ')).toEqual({ kind: 'none' });
    expect(recognizePlaceText('Bless')).toEqual({ kind: 'none' });
    expect(recognizePlaceText('Ruf an: 030 1234567')).toEqual({ kind: 'none' });
    expect(recognizePlaceText('12345')).toEqual({ kind: 'none' });
    expect(recognizePlaceText('javascript:alert(1)')).toEqual({ kind: 'none' });
    expect(recognizePlaceText('ftp://bless.de')).toEqual({ kind: 'none' });
    expect(recognizePlaceText(`Hauptstr. 1, 10117 Berlin ${'x'.repeat(400)}`)).toEqual({
      kind: 'none',
    });
  });
});

describe('insertedText: a paste is more than one typed character (spec 0042, REQ-003)', () => {
  it('AC-006: pasted into an empty field: the whole text', () => {
    expect(insertedText('', 'Oranienburger Str. 45, 10117 Berlin')).toBe(
      'Oranienburger Str. 45, 10117 Berlin',
    );
  });

  it('pasted into the middle: only what was inserted', () => {
    expect(insertedText('ab', 'a https://x.de b')).toBe(' https://x.de ');
  });

  it('replacing the selected text: the new text', () => {
    expect(insertedText('alt', 'https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc');
  });

  it('typing one character or deleting is no paste', () => {
    expect(insertedText('Bles', 'Bless')).toBeUndefined();
    expect(insertedText('Bless', 'Bles')).toBeUndefined();
    expect(insertedText('Bless', 'Bless')).toBeUndefined();
  });

  it('a repeated letter is found once (no overlap of prefix and suffix)', () => {
    expect(insertedText('aa', 'aaaa')).toBe('aa');
  });
});

describe('recognizePaste: what a paste into a place field is (spec 0042, REQ-003)', () => {
  it('AC-005: a map link pasted into an empty field is a map link', () => {
    expect(recognizePaste('', 'https://maps.app.goo.gl/abc')).toEqual({
      kind: 'maps',
      url: 'https://maps.app.goo.gl/abc',
    });
  });

  it('a map link replacing another one stays a map link (the shared "https://" is no web address)', () => {
    const next = 'https://www.google.com/maps/place/Bless/@52.5,13.4,17z';
    expect(recognizePaste('https://maps.app.goo.gl/abc', next)).toEqual(recognizePlaceText(next));
    expect(recognizePaste('https://maps.app.goo.gl/abc', next)?.kind).toBe('maps');
  });

  it('AC-006: an address pasted behind a typed name is the pasted address only', () => {
    expect(recognizePaste('Bless', 'BlessOranienburger Str. 45, 10117 Berlin')).toEqual({
      kind: 'address',
      text: 'Oranienburger Str. 45, 10117 Berlin',
    });
  });

  it('typing is no paste', () => {
    expect(recognizePaste('Bles', 'Bless')).toBeUndefined();
  });
});

describe('nextEmptyField: the cursor goes on to the next empty field (spec 0042, AC-006)', () => {
  const order = ['link', 'address', 'website'] as const;

  it('AC-006: after the address the next empty field after it, else the first empty one', () => {
    expect(nextEmptyField(order, { link: '', address: 'x', website: '' }, 'address')).toBe(
      'website',
    );
    expect(nextEmptyField(order, { link: '', address: 'x', website: 'y' }, 'address')).toBe('link');
  });

  it('nothing empty: no field', () => {
    expect(
      nextEmptyField(order, { link: 'a', address: 'b', website: 'c' }, 'link'),
    ).toBeUndefined();
  });

  it('blank counts as empty; fields the form does not have are skipped', () => {
    expect(nextEmptyField(['link', 'address'], { link: 'a', address: '  ' }, 'link')).toBe(
      'address',
    );
  });
});
