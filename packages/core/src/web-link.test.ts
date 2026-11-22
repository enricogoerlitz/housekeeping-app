import { describe, expect, it } from 'vitest';

import {
  addLink,
  isWebUrl,
  linkDisplay,
  linkHost,
  LINK_LIMIT_HINT,
  MAX_LINKS,
  normalizeWebUrl,
  normalizeWebsite,
  validateLink,
} from './web-link';
import type { RecipeLink } from './types';

describe('normalizeWebsite (spec 0024, REQ-003)', () => {
  it('AC-008: "https://" is added to a typed website', () => {
    expect(normalizeWebsite(' trattoria-da-enzo.de ')).toEqual({
      url: 'https://trattoria-da-enzo.de',
    });
  });

  it('AC-009: only http and https, and a host with a dot', () => {
    for (const input of ['javascript:alert(1)', 'ftp://enzo.de', 'mailto:info@enzo.de']) {
      expect(normalizeWebsite(input)).toEqual({
        problem: 'Nur Adressen mit http:// oder https://',
      });
    }
    for (const input of ['trattoria da enzo', 'localhost']) {
      expect(normalizeWebsite(input)).toEqual({ problem: 'Keine gültige Adresse' });
    }
  });

  it('AC-011: an empty field removes the website', () => {
    expect(normalizeWebsite('   ')).toEqual({ url: undefined });
  });
});

describe('normalizeWebUrl', () => {
  it('AC-031: keeps an https address as it is', () => {
    expect(normalizeWebUrl('https://www.chefkoch.de/rezepte/123/lasagne.html')).toEqual({
      url: 'https://www.chefkoch.de/rezepte/123/lasagne.html',
    });
  });

  it('AC-032: puts https:// in front of an address without scheme and trims the edges', () => {
    expect(normalizeWebUrl('  chefkoch.de/r/1 ')).toEqual({ url: 'https://chefkoch.de/r/1' });
  });

  it('lower-cases the scheme', () => {
    expect(normalizeWebUrl('HTTPS://Chefkoch.de/R')).toEqual({ url: 'https://Chefkoch.de/R' });
  });

  it('treats a host with a port as an address without scheme', () => {
    expect(normalizeWebUrl('chefkoch.de:8080/r')).toEqual({ url: 'https://chefkoch.de:8080/r' });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hallo',
    'mailto:info@enzo.de',
    'ftp://server/datei',
  ])('AC-033: refuses %s as not http or https', (input) => {
    expect(normalizeWebUrl(input)).toEqual({
      problem: 'Nur Adressen mit http:// oder https://',
    });
  });

  it.each([
    'https://',
    'https://chef koch.de',
    'localhost',
    'https://user@chefkoch.de',
    'https://a..de',
  ])('AC-033: refuses %s as no valid address', (input) => {
    expect(normalizeWebUrl(input)).toEqual({ problem: 'Keine gültige Adresse' });
  });

  it('asks for an address when the field is empty', () => {
    expect(normalizeWebUrl('   ')).toEqual({ problem: 'Adresse fehlt' });
  });

  it('AC-035: refuses more than 2000 characters', () => {
    expect(normalizeWebUrl(`https://chefkoch.de/${'a'.repeat(1981)}`)).toEqual({
      problem: 'Höchstens 2000 Zeichen',
    });
    expect(normalizeWebUrl(`https://chefkoch.de/${'a'.repeat(1980)}`)).toHaveProperty('url');
  });
});

describe('isWebUrl', () => {
  it('follows the rule of private.is_web_url', () => {
    expect(isWebUrl('https://bäckerei-müller.de/brot')).toBe(true);
    expect(isWebUrl('http://chefkoch.de:8443/r?x=1#top')).toBe(true);
    expect(isWebUrl('chefkoch.de')).toBe(false);
    expect(isWebUrl(' https://chefkoch.de')).toBe(false);
    expect(isWebUrl('https://chefkoch.de/\u200br')).toBe(false);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('https://chefkoch.de/\n')).toBe(false);
  });
});

describe('linkHost and linkDisplay', () => {
  it('AC-031: shows the host without www.', () => {
    expect(linkHost('https://www.chefkoch.de/rezepte/123/lasagne.html')).toBe('chefkoch.de');
    expect(linkHost('https://Chefkoch.DE:8080/x')).toBe('chefkoch.de');
  });

  it('AC-031: a link without label shows only the host and opens the address', () => {
    expect(linkDisplay({ url: 'https://www.chefkoch.de/rezepte/123/lasagne.html' })).toEqual({
      title: 'chefkoch.de',
      href: 'https://www.chefkoch.de/rezepte/123/lasagne.html',
    });
  });

  it('AC-032: a link with label shows the label over the host', () => {
    expect(linkDisplay({ url: 'https://chefkoch.de/r/1', label: 'Omas Variante' })).toEqual({
      title: 'Omas Variante',
      subtitle: 'chefkoch.de',
      href: 'https://chefkoch.de/r/1',
    });
  });

  it('AC-035: a link that fails the check on the device is text without a target', () => {
    expect(linkDisplay({ url: 'javascript:alert(1)' })).toEqual({ title: 'javascript:alert(1)' });
    expect(linkDisplay({ url: 'javascript:alert(1)', label: 'Klick' })).toEqual({
      title: 'Klick',
      subtitle: 'javascript:alert(1)',
    });
  });
});

describe('validateLink', () => {
  const links: RecipeLink[] = [{ url: 'https://chefkoch.de/r/1' }];

  it('AC-032: gives the normalised link with a trimmed label', () => {
    expect(validateLink({ url: 'chefkoch.de/r/2', label: ' Omas Variante ' }, links)).toEqual({
      link: { url: 'https://chefkoch.de/r/2', label: 'Omas Variante' },
    });
  });

  it('drops a blank label and removes control characters from it', () => {
    expect(validateLink({ url: 'chefkoch.de/r/2', label: '  ' }, links)).toEqual({
      link: { url: 'https://chefkoch.de/r/2' },
    });
    expect(validateLink({ url: 'chefkoch.de/r/2', label: 'Oma\u0007s' }, links)).toEqual({
      link: { url: 'https://chefkoch.de/r/2', label: 'Omas' },
    });
  });

  it('AC-035: refuses a label over 80 characters', () => {
    expect(validateLink({ url: 'chefkoch.de/r/2', label: 'x'.repeat(81) }, links)).toEqual({
      field: 'label',
      problem: 'Höchstens 80 Zeichen',
    });
  });

  it('AC-034: refuses an address that is there already', () => {
    expect(validateLink({ url: 'chefkoch.de/r/1', label: '' }, links)).toEqual({
      field: 'url',
      problem: 'Diesen Link gibt es schon',
    });
  });

  it('keeps the address of the link being edited', () => {
    expect(validateLink({ url: 'https://chefkoch.de/r/1', label: 'Neu' }, links, 0)).toEqual({
      link: { url: 'https://chefkoch.de/r/1', label: 'Neu' },
    });
  });

  it('AC-033: reports the address problem on the field', () => {
    expect(validateLink({ url: 'javascript:alert(1)', label: '' }, links)).toEqual({
      field: 'url',
      problem: 'Nur Adressen mit http:// oder https://',
    });
  });
});

describe('addLink', () => {
  it('AC-034: refuses an eleventh link', () => {
    const ten = Array.from({ length: MAX_LINKS }, (_, index) => ({
      url: `https://chefkoch.de/r/${index}`,
    }));
    expect(() => addLink(ten, { url: 'https://chefkoch.de/x' })).toThrow(LINK_LIMIT_HINT);
    expect(LINK_LIMIT_HINT).toBe('Höchstens 10 Links');
    expect(addLink(ten.slice(1), { url: 'https://chefkoch.de/x' })).toHaveLength(10);
  });
});
