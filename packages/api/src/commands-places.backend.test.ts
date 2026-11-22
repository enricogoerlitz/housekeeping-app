// Spec 0024 — restaurants and activities: every field of a restaurant edited, website and
// restaurant photo, deleting both with "Rückgängig".
import { describe, expect, it } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, TODAY, withBackend } from './backend-test-helpers';
import { createActivity, updateActivity } from './commands-activities';
import { ACTIVITY_GONE_MESSAGE, addPlanEntry, RESTAURANT_GONE_MESSAGE } from './commands-plan';
import { deleteActivity, deleteRestaurant, discardPlacePhoto } from './commands-places';
import { createRestaurant, readMapsLink, updateRestaurant } from './commands-restaurants';
import { removeRestaurantPhoto, setRestaurantPhoto } from './photos-remote';
import { ENRICO, NADJA } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const restaurant = (id: string) => getData().restaurants.find((candidate) => candidate.id === id);
const activity = (id: string) => getData().activities.find((candidate) => candidate.id === id);
const entry = (id: string) => getData().planEntries.find((candidate) => candidate.id === id);

const photo = (fill = 1, size = 2048) =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(size).fill(fill)], {
    type: 'image/jpeg',
  });

describe('Restaurant bearbeiten (REQ-001)', () => {
  it('AC-001: a corrected cuisine is saved and reaches the other device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    updateRestaurant('rest-pho', { cuisine: ' Griechisch ' });
    expect(restaurant('rest-pho')?.cuisine).toBe('Griechisch');
    await fx.settle(nadja);
    expect(fx.server.row(H, 'restaurants', 'rest-pho')).toMatchObject({ cuisine: 'Griechisch' });
    expect(fx.nadjaData(nadja).restaurants.find((r) => r.id === 'rest-pho')?.cuisine).toBe(
      'Griechisch',
    );
  });

  it('AC-002: tags, price and website are patched together', async () => {
    await fx.startEnrico();
    updateRestaurant('rest-enzo', {
      tags: ['pasta', 'Pasta', ' gemütlich ', 'draußen'],
      priceLevel: 3,
      websiteUrl: 'trattoria-da-enzo.de',
    });
    await fx.settle();
    expect(fx.server.row(H, 'restaurants', 'rest-enzo')).toMatchObject({
      tags: ['pasta', 'gemütlich', 'draußen'],
      price_level: 3,
      website_url: 'https://trattoria-da-enzo.de',
    });
  });

  it('REQ-001: an emptied map link clears link and coordinates', async () => {
    await fx.startEnrico();
    updateRestaurant('rest-enzo', { mapsUrl: undefined, location: undefined });
    await fx.settle();
    expect(fx.server.row(H, 'restaurants', 'rest-enzo')).toMatchObject({
      maps_url: null,
      lat: null,
      lng: null,
    });
  });

  it('AC-003: without a name nothing changes and nothing is sent', async () => {
    await fx.startEnrico();
    expect(() => updateRestaurant('rest-enzo', { name: '  ' })).toThrow('Name fehlt');
    expect(() =>
      updateRestaurant('rest-enzo', { tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }),
    ).toThrow('Höchstens 30 Schlagworte');
    await fx.settle();
    expect(fx.calls).toEqual([]);
    expect(restaurant('rest-enzo')?.name).toBe('Trattoria Da Enzo');
  });

  it('AC-004: the link of another restaurant is a duplicate, the own link is not', async () => {
    await fx.startEnrico();
    const pho = restaurant('rest-pho');
    if (!pho?.mapsUrl) throw new Error('fixture');
    expect(readMapsLink(pho.mapsUrl, 'rest-enzo')).toMatchObject({
      duplicate: { id: 'rest-pho' },
    });
    expect(readMapsLink(pho.mapsUrl, 'rest-pho')).toMatchObject({ duplicate: undefined });
  });

  it('AC-005: a restaurant Nadja deleted meanwhile is refused with the hint', async () => {
    const engine = await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    await fx.server.transport(NADJA).deleteRestaurant('rest-burger', TODAY);
    updateRestaurant('rest-burger', { cuisine: 'Burger & Bowls' });
    await fx.settle();
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    await engine.pull();
    expect(restaurant('rest-burger')).toBeUndefined();
    stop();
  });
});

describe('Einplanen (REQ-005, REQ-006)', () => {
  it.each([
    ['AC-020', 'restaurant', 'rest-burger', RESTAURANT_GONE_MESSAGE],
    ['AC-022', 'activity', 'act-spieleabend', ACTIVITY_GONE_MESSAGE],
  ] as const)(
    '%s: planning a %s Nadja deleted meanwhile makes no entry and says so',
    async (_, kind, id, hint) => {
      await fx.startEnrico();
      const messages: string[] = [];
      const stop = onWriteRejected((message) => messages.push(message));
      const wire = fx.server.transport(NADJA);
      await (kind === 'restaurant'
        ? wire.deleteRestaurant(id, TODAY)
        : wire.deleteActivity(id, TODAY));
      const planned = addPlanEntry({
        date: TODAY,
        slotId: getData().planEntries[0]?.slotId ?? '',
        kind,
        ...(kind === 'restaurant' ? { restaurantId: id } : { activityId: id }),
        eaterIds: [ENRICO],
      });
      await fx.settle();
      expect(messages).toEqual([hint]);
      expect(entry(planned)).toBeUndefined();
      stop();
    },
  );
});

describe('Webseite (REQ-003)', () => {
  it('AC-008: "https://" is added when creating', async () => {
    await fx.startEnrico();
    const id = createRestaurant({ name: 'Taverna Olympia', websiteUrl: 'taverna-olympia.de' });
    await fx.settle();
    expect(fx.server.row(H, 'restaurants', id)).toMatchObject({
      website_url: 'https://taverna-olympia.de',
    });
  });

  it('AC-009: no other scheme, nothing is sent', async () => {
    await fx.startEnrico();
    expect(() => updateRestaurant('rest-enzo', { websiteUrl: 'javascript:alert(1)' })).toThrow(
      'Nur Adressen mit http:// oder https://',
    );
    expect(() => createActivity({ name: 'Kino', websiteUrl: 'localhost' })).toThrow(
      'Keine gültige Adresse',
    );
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-011: the website of an activity is set and cleared again', async () => {
    await fx.startEnrico();
    updateActivity('act-eislaufen', { websiteUrl: 'https://www.eisstadion-koeln.de' });
    await fx.settle();
    expect(fx.server.row(H, 'activities', 'act-eislaufen')?.website_url).toBe(
      'https://www.eisstadion-koeln.de',
    );
    updateActivity('act-eislaufen', { websiteUrl: '' });
    await fx.settle();
    expect(activity('act-eislaufen')?.websiteUrl).toBeUndefined();
    expect(fx.server.row(H, 'activities', 'act-eislaufen')?.website_url).toBeNull();
  });
});

describe('Foto am Restaurant (REQ-004)', () => {
  it('AC-012: uploads into the restaurants folder, then sets the path; Nadja sees it', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    await setRestaurantPhoto('rest-enzo', photo(7));
    await fx.settle(nadja);
    const path = restaurant('rest-enzo')?.photoPath;
    expect(path).toMatch(new RegExp(`^${H}/restaurants/rest-enzo/[0-9a-f-]{36}\\.jpg$`));
    expect(fx.server.media(path ?? '')).toBeDefined();
    expect(fx.nadjaData(nadja).restaurants.find((r) => r.id === 'rest-enzo')?.photoPath).toBe(path);
  });

  it('AC-013: "Foto entfernen" clears the path, then deletes the file', async () => {
    await fx.startEnrico();
    await setRestaurantPhoto('rest-enzo', photo(7));
    await fx.settle();
    const path = restaurant('rest-enzo')?.photoPath ?? '';
    await removeRestaurantPhoto('rest-enzo');
    await fx.settle();
    expect(restaurant('rest-enzo')?.photoPath).toBeUndefined();
    expect(fx.server.media(path)).toBeUndefined();
  });

  it('AC-014: offline nothing is uploaded', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    await expect(setRestaurantPhoto('rest-enzo', photo())).rejects.toBeInstanceOf(OfflineError);
    fx.environment.setOnline(true);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('Löschen mit „Rückgängig“ (REQ-010)', () => {
  it('AC-034: Enzo is gone at once, the past visit is free text, the later one is gone; Nadja too', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    expect(deleteRestaurant('rest-enzo')).toMatchObject({ kind: 'restaurant', entries: 1 });
    expect(restaurant('rest-enzo')).toBeUndefined();
    expect(entry('plan-enzo-2')).toBeUndefined();
    expect(entry('plan-enzo-1')).toMatchObject({
      kind: 'text',
      text: 'Trattoria Da Enzo',
      restaurantId: undefined,
    });
    await fx.settle(nadja);
    expect(fx.calls).toEqual([{ fn: 'deleteRestaurant', args: ['rest-enzo', TODAY] }]);
    expect(fx.server.row(H, 'restaurants', 'rest-enzo')).toBeUndefined();
    expect(fx.nadjaData(nadja).restaurants.some((r) => r.id === 'rest-enzo')).toBe(false);
    expect(fx.nadjaData(nadja).planEntries.find((e) => e.id === 'plan-enzo-1')).toMatchObject({
      kind: 'text',
      text: 'Trattoria Da Enzo',
    });
  });

  it('AC-035: "Rückgängig" brings ratings, favourites, the entry with 19:30 and the visit back', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const before = restaurant('rest-enzo');
    const restore = snapshot();
    deleteRestaurant('rest-enzo');
    await fx.settle(nadja);
    restore();
    await fx.settle(nadja);
    expect(fx.calls).toEqual([
      { fn: 'deleteRestaurant', args: ['rest-enzo', TODAY] },
      { fn: 'restoreRestaurant', args: ['rest-enzo'] },
    ]);
    expect(restaurant('rest-enzo')).toMatchObject({
      ratings: before?.ratings,
      favoriteOf: expect.arrayContaining([ENRICO, NADJA]),
    });
    expect(entry('plan-enzo-2')).toMatchObject({ restaurantId: 'rest-enzo', startsAt: '19:30' });
    expect(entry('plan-enzo-1')).toMatchObject({ kind: 'restaurant', restaurantId: 'rest-enzo' });
    expect(fx.nadjaData(nadja).restaurants.some((r) => r.id === 'rest-enzo')).toBe(true);
  });

  it('AC-037: a free text Nadja changed meanwhile stays as she wrote it', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const restore = snapshot();
    deleteRestaurant('rest-enzo');
    await fx.settle(nadja);
    await fx.server.transport(NADJA).applyChanges(H, [
      {
        kind: 'patch',
        table: 'meal_plan_entries',
        id: 'plan-enzo-1',
        changes: { text: 'Pizza bei Enzo' },
      },
    ]);
    restore();
    await fx.settle(nadja);
    await fx.settle();
    expect(fx.server.row(H, 'meal_plan_entries', 'plan-enzo-1')).toMatchObject({
      kind: 'text',
      text: 'Pizza bei Enzo',
    });
    expect(fx.server.row(H, 'restaurants', 'rest-enzo')).toBeDefined();
  });

  it('AC-036: Eislaufen with photo; the photo goes only when the notice ends without undo', async () => {
    await fx.startEnrico();
    const wire = fx.server.transport(ENRICO);
    const path = `${H}/activities/act-eislaufen/${crypto.randomUUID()}.jpg`;
    await wire.uploadMedia(path, photo(9));
    await wire.applyChanges(H, [
      { kind: 'patch', table: 'activities', id: 'act-eislaufen', changes: { photo_path: path } },
    ]);
    await fx.settle();
    fx.clearCalls();
    const deletion = deleteActivity('act-eislaufen');
    if (!deletion) throw new Error('fixture');
    expect(entry('plan-eislaufen-1')).toMatchObject({
      kind: 'text',
      text: 'Eislaufen (Hohenschönhausen)',
      note: undefined,
    });
    await fx.settle();
    await discardPlacePhoto(deletion);
    expect(fx.calls.map((call) => call.fn)).toEqual(['deleteActivity', 'removeMedia']);
    expect(fx.server.media(path)).toBeUndefined();
  });

  it('AC-036: after "Rückgängig" or a refusal the photo stays', async () => {
    await fx.startEnrico();
    const restore = snapshot();
    const undone = deleteActivity('act-bouldern');
    if (!undone) throw new Error('fixture');
    await fx.settle();
    restore();
    await discardPlacePhoto({ ...undone, photoPath: 'p' });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['deleteActivity', 'restoreActivity']);
    fx.clearCalls();
    fx.server.failNext('delete_activity', new TransportError('permanent', 'boom', 400));
    const refused = deleteActivity('act-bouldern');
    if (!refused) throw new Error('fixture');
    await fx.settle();
    await discardPlacePhoto({ ...refused, photoPath: 'p' });
    expect(fx.calls.map((call) => call.fn)).toEqual(['deleteActivity']);
    expect(activity('act-bouldern')).toBeDefined();
  });

  it('negative: offline throws OfflineError and sends nothing; an unknown id does nothing', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    expect(() => deleteRestaurant('rest-enzo')).toThrow(OfflineError);
    expect(() => deleteActivity('act-eislaufen')).toThrow(OfflineError);
    fx.environment.setOnline(true);
    expect(deleteRestaurant('rest-unknown')).toBeUndefined();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-038: another household cannot delete, Nadja cannot restore Enrico’s deletion', async () => {
    await fx.startEnrico();
    await expect(
      fx.server.transport('u-stranger').deleteRestaurant('rest-enzo', TODAY),
    ).rejects.toMatchObject({ code: 'restaurant_not_found' });
    deleteRestaurant('rest-enzo');
    await fx.settle();
    await expect(fx.server.transport(NADJA).restoreRestaurant('rest-enzo')).rejects.toMatchObject({
      code: 'restaurant_not_restorable',
    });
  });
});
