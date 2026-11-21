import { describe, expect, it } from 'vitest';

import { parseMapsLink } from './maps-link';

describe('parseMapsLink', () => {
  it('AC-003: reads name and coordinates from a Google /maps/place/…/@lat,lng link', () => {
    const url = 'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z';
    expect(parseMapsLink(url)).toEqual({
      kind: 'place',
      provider: 'google',
      name: 'Trattoria Da Enzo',
      location: { lat: 50.9271, lng: 6.958 },
      url,
    });
  });

  it('AC-003: prefers the place pin (!3d…!4d…) over the map centre (@…) in Google links', () => {
    const url =
      'https://www.google.com/maps/place/Copenhagen+Coffee+Lab/@43.626,6.648,10z/data=!4m6!3m5!1s0x0:0x1!8m2!3d43.6992!4d7.2774!16s%2Fg%2F1';
    expect(parseMapsLink(url)).toMatchObject({
      kind: 'place',
      name: 'Copenhagen Coffee Lab',
      location: { lat: 43.6992, lng: 7.2774 },
    });
  });

  it('AC-004: reads name and coordinates from an Apple Karten link with q and ll', () => {
    const url = 'https://maps.apple.com/?q=Pho+Saigon&ll=50.94,6.95';
    expect(parseMapsLink(url)).toEqual({
      kind: 'place',
      provider: 'apple',
      name: 'Pho Saigon',
      location: { lat: 50.94, lng: 6.95 },
      url,
    });
  });

  it('prefers the Apple "name" parameter and also reads "coordinate"', () => {
    const link = parseMapsLink(
      'https://maps.apple.com/place?name=Caf%C3%A9%20Fleur&coordinate=50.93,6.94&address=K%C3%B6ln',
    );
    expect(link).toMatchObject({ name: 'Café Fleur', location: { lat: 50.93, lng: 6.94 } });
  });

  it('reads the name from Google ?q= and ?query= links', () => {
    expect(parseMapsLink('https://maps.google.com/?q=Pho+Saigon')).toMatchObject({
      provider: 'google',
      name: 'Pho Saigon',
      location: undefined,
    });
    expect(
      parseMapsLink('https://www.google.com/maps/search/?api=1&query=Sushi%20Kyoto'),
    ).toMatchObject({ name: 'Sushi Kyoto' });
  });

  it('decodes encoded names and keeps a malformed escape as written', () => {
    expect(
      parseMapsLink('https://www.google.de/maps/place/Caf%C3%A9+M%C3%BCller/@50.1,6.2,17z'),
    ).toMatchObject({ name: 'Café Müller', location: { lat: 50.1, lng: 6.2 } });
    expect(parseMapsLink('https://www.google.com/maps/place/100%+Pasta/@50.1,6.2')).toMatchObject({
      name: '100% Pasta',
    });
  });

  it('reads negative coordinates and drops impossible ones', () => {
    expect(parseMapsLink('https://www.google.com/maps/place/Ort/@-33.86,-151.2,12z')).toMatchObject(
      { location: { lat: -33.86, lng: -151.2 } },
    );
    expect(parseMapsLink('https://www.google.com/maps/place/Ort/@95.1,6.9,12z')).toMatchObject({
      name: 'Ort',
      location: undefined,
    });
    expect(parseMapsLink('https://maps.apple.com/?q=Ort&ll=abc,def')).toMatchObject({
      location: undefined,
    });
  });

  it('AC-005: recognises a maps.app.goo.gl short link', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/AbC123')).toEqual({
      kind: 'short',
      provider: 'google',
      url: 'https://maps.app.goo.gl/AbC123',
    });
  });

  it('recognises goo.gl/maps short links but no other goo.gl links', () => {
    expect(parseMapsLink('https://goo.gl/maps/xyz')).toMatchObject({ kind: 'short' });
    expect(parseMapsLink('https://goo.gl/abc')).toBeNull();
  });

  it('AC-006: "hallo welt" and an empty string are no map links', () => {
    expect(parseMapsLink('hallo welt')).toBeNull();
    expect(parseMapsLink('')).toBeNull();
  });

  it('accepts Google country domains', () => {
    expect(parseMapsLink('https://www.google.co.uk/maps/place/Dishoom/@51.5,-0.1')).toMatchObject({
      provider: 'google',
      name: 'Dishoom',
    });
    expect(parseMapsLink('https://www.google.com.au/maps/place/Ort/@-33.8,151.2')).toMatchObject({
      name: 'Ort',
    });
    expect(parseMapsLink('https://maps.google.de/?q=Enzo')).toMatchObject({ name: 'Enzo' });
  });

  it('rejects links of other sites, also ones that only look like Google', () => {
    expect(parseMapsLink('https://example.com/maps/place/Enzo/@50.1,6.2')).toBeNull();
    expect(parseMapsLink('https://www.google.com/search?q=Enzo')).toBeNull();
    expect(parseMapsLink('https://maps.google.com.evil.example/maps/place/Enzo')).toBeNull();
    expect(parseMapsLink('https://google.evil.com/maps/place/Enzo')).toBeNull();
    expect(parseMapsLink('https://www.google.com@evil.example/maps/place/Enzo')).toBeNull();
  });

  it('rejects a javascript: link and only ever returns http(s) URLs', () => {
    expect(parseMapsLink('javascript:alert(1)')).toBeNull();
    expect(parseMapsLink('javascript:alert(1)//maps.google.com/?q=x')).toBeNull();
    const embedded = parseMapsLink(
      'javascript:alert(1)//https://www.google.com/maps/place/Enzo/@50.1,6.2',
    );
    expect(embedded?.url.startsWith('https://www.google.com/')).toBe(true);
  });

  it('uses the first URL of a longer shared text', () => {
    const shared =
      'Trattoria Da Enzo\nhttps://maps.apple.com/?q=Trattoria+Da+Enzo&ll=50.9271,6.958 lecker!';
    expect(parseMapsLink(shared)).toMatchObject({
      provider: 'apple',
      name: 'Trattoria Da Enzo',
      url: 'https://maps.apple.com/?q=Trattoria+Da+Enzo&ll=50.9271,6.958',
    });
  });
});
