// Spec 0027 "Verwalten und Konto": withdrawing invitations, the own profile, renaming and
// deleting the household (photos first), the own feedback and "Jetzt abgleichen", against the
// in-memory server.
import { describe, expect, it, vi } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { readSmallTables, syncNow, SYNC_FAILED_MESSAGE } from './backend';
import { invitationsOfHousehold } from './households';
import {
  addFeedback,
  createHousehold,
  deleteFeedback,
  deleteHousehold,
  editFeedback,
  inviteMember,
  renameHousehold,
  switchHousehold,
  updateProfile,
  withdrawInvitation,
} from './commands-household';
import { updateNotificationSettings } from './commands-notifications';
import { setItemChecked } from './commands-shopping';
import { ENRICO, NADJA } from './seed/demo';
import { getData, getState, OfflineError } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
const photoPath = (householdId: string) =>
  `${householdId}/activities/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;

describe('Einladung zurückziehen (REQ-001)', () => {
  it('AC-001: withdrawing is one call and the invitation is gone after the pull', async () => {
    await fx.startEnrico();
    const id = await inviteMember('lena@example.com');
    fx.clearCalls();
    await withdrawInvitation(id);
    expect(fx.calls).toEqual([{ fn: 'withdrawInvitation', args: [id] }]);
    expect(getState().households[H]).toBeDefined();
    expect(invitationsOfHousehold(readSmallTables(), H)).toEqual([]);
  });

  it('AC-004: a foreign or unknown invitation comes back as "Diese Einladung gibt es nicht mehr."', async () => {
    await fx.startEnrico();
    await expect(withdrawInvitation('inv-unknown')).rejects.toThrow(
      'Diese Einladung gibt es nicht mehr.',
    );
  });

  it('offline nothing is sent', async () => {
    const engine = await fx.startEnrico();
    engine.setSimulatedOffline(true);
    await expect(withdrawInvitation('inv-x')).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });
});

describe('Profil bearbeiten (REQ-003)', () => {
  it('AC-009: the profile is saved and Nadja reads it after her pull', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    await fx.startEnrico();
    fx.clearCalls();
    await updateProfile({
      name: ' Enrico G. ',
      color: '#2F7F7A',
      dietPreference: 'vegetarian',
      dislikes: ['Koriander'],
    });
    expect(fx.calls).toEqual([
      {
        fn: 'updateProfile',
        args: [
          {
            name: 'Enrico G.',
            color: '#2F7F7A',
            dietPreference: 'vegetarian',
            dislikes: ['Koriander'],
          },
        ],
      },
    ]);
    const me = getState().members.find((member) => member.id === ENRICO);
    expect(me).toMatchObject({ name: 'Enrico G.', color: '#2F7F7A', dislikes: ['Koriander'] });
    await fx.settle(nadja);
    await nadja.pull();
    expect(nadja.getState()?.members.find((member) => member.id === ENRICO)?.name).toBe(
      'Enrico G.',
    );
  });

  it('AC-010: an empty name is refused before anything is sent', async () => {
    await fx.startEnrico();
    await expect(
      updateProfile({ name: '  ', color: '#2F7F7A', dietPreference: 'vegan', dislikes: [] }),
    ).rejects.toThrow('Der Name fehlt.');
    expect(fx.calls).toEqual([]);
  });

  it('AC-012: a colour outside the palette is refused by the server', async () => {
    await fx.startEnrico();
    await expect(
      updateProfile({ name: 'Enrico', color: '#000000', dietPreference: 'vegan', dislikes: [] }),
    ).rejects.toThrow('Nicht gespeichert');
  });

  it('AC-013: when the network breaks, "Nicht gespeichert – bitte mit Netz noch einmal versuchen."', async () => {
    await fx.startEnrico();
    fx.server.failNext('update_profile', new TransportError('transient', 'network'));
    await expect(
      updateProfile({ name: 'Enrico', color: '#2F7F7A', dietPreference: 'vegan', dislikes: [] }),
    ).rejects.toThrow('Nicht gespeichert – bitte mit Netz noch einmal versuchen.');
  });
});

describe('Haushalt umbenennen (REQ-004)', () => {
  it('AC-014: the new name is one patch of households and reaches Nadja', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    await fx.startEnrico();
    fx.clearCalls();
    expect(renameHousehold(' Kuschelnest ')).toBe('saved');
    expect(getState().households[H]?.household.name).toBe('Kuschelnest');
    await fx.settle(nadja);
    expect(fx.calls[0]?.args[1]).toEqual([
      { kind: 'patch', table: 'households', id: H, changes: { name: 'Kuschelnest' } },
    ]);
    await nadja.pull();
    expect(nadja.getState()?.households[H]?.household.name).toBe('Kuschelnest');
  });

  it('AC-015: unchanged sends nothing; empty is refused', async () => {
    await fx.startEnrico();
    const name = getState().households[H]?.household.name ?? '';
    expect(renameHousehold(` ${name} `)).toBe('kept');
    expect(() => renameHousehold('   ')).toThrow('Der Name fehlt.');
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('Haushalt löschen (REQ-005)', () => {
  it('AC-019: photos first, then delete_household; the device holds nothing of it', async () => {
    await fx.startEnrico();
    const wg = await createHousehold('WG Köln');
    const path = photoPath(wg);
    await fx.server.transport(ENRICO).uploadMedia(path, jpeg());
    switchHousehold(wg);
    fx.clearCalls();
    await deleteHousehold(wg);
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'beginHouseholdDeletion',
      'removeMedia',
      'deleteHousehold',
    ]);
    expect(fx.calls[1]?.args[0]).toEqual([path]);
    expect(fx.server.media(path)).toBeUndefined();
    expect(getState().households[wg]).toBeUndefined();
    expect(getState().activeHouseholdId).toBe(H);
  });

  it('AC-021, AC-022: with a second member the server refuses with the German hint', async () => {
    await fx.startEnrico();
    const path = photoPath(H);
    await fx.server.transport(ENRICO).uploadMedia(path, jpeg());
    fx.clearCalls();
    await expect(deleteHousehold(H)).rejects.toThrow(
      'Inzwischen ist noch jemand Mitglied. Löschen geht nur als letztes Mitglied.',
    );
    expect(getState().households[H]).toBeDefined();
    // The server refuses before any photo is deleted.
    expect(fx.calls.map((call) => call.fn)).toEqual(['beginHouseholdDeletion']);
    expect(fx.server.media(path)).toBeDefined();
  });

  it('AC-023: a failure after part of the photos keeps the household; a second try deletes it', async () => {
    await fx.startEnrico();
    const wg = await createHousehold('WG Köln');
    await fx.server.transport(ENRICO).uploadMedia(photoPath(wg), jpeg());
    fx.server.failNext('storage_remove', new TransportError('transient', 'network'));
    await expect(deleteHousehold(wg)).rejects.toThrow(
      'Löschen nicht abgeschlossen – „WG Köln“ ist noch da. Bitte mit Netz noch einmal löschen.',
    );
    expect(getState().households[wg]).toBeDefined();
    fx.server.failNext('delete_household', new TransportError('transient', 'network'));
    await expect(deleteHousehold(wg)).rejects.toThrow('Löschen nicht abgeschlossen');
    expect(getState().households[wg]).toBeDefined();
    await deleteHousehold(wg);
    expect(getState().households[wg]).toBeUndefined();
  });

  it('AC-024: offline nothing is sent', async () => {
    const engine = await fx.startEnrico();
    engine.setSimulatedOffline(true);
    await expect(deleteHousehold(H)).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });
});

describe('Eigenes Feedback (REQ-006)', () => {
  it('AC-025: editing sends kind and text only; AC-026: deleting is one delete', async () => {
    await fx.startEnrico();
    const id = addFeedback({ kind: 'idea', text: 'Einkaufsliste nach Markt sortieren' });
    await fx.settle();
    fx.clearCalls();
    editFeedback(id, { kind: 'idea', text: ' Einkaufsliste nach Laufreihenfolge sortieren ' });
    await fx.settle();
    expect(fx.calls[0]?.args[1]).toEqual([
      {
        kind: 'patch',
        table: 'feedback',
        id,
        changes: { text: 'Einkaufsliste nach Laufreihenfolge sortieren' },
      },
    ]);
    expect(() => editFeedback(id, { kind: 'idea', text: '  ' })).toThrow(
      'Schreib zuerst, worum es geht',
    );
    fx.clearCalls();
    deleteFeedback(id);
    expect(getData().feedback.some((entry) => entry.id === id)).toBe(false);
    await fx.settle();
    expect(fx.calls[0]?.args[1]).toEqual([{ kind: 'delete', table: 'feedback', id }]);
    expect(fx.server.row(H, 'feedback', id)).toBeUndefined();
  });

  it('AC-027: another person’s entry is neither edited nor deleted', async () => {
    await fx.startAs(NADJA);
    const id = addFeedback({ kind: 'problem', text: 'Knopf zu klein' });
    await fx.settle();
    await fx.startEnrico();
    expect(() => editFeedback(id, { kind: 'problem', text: 'Gekapert' })).toThrow();
    expect(() => deleteFeedback(id)).toThrow();
  });
});

describe('Jetzt abgleichen (REQ-010)', () => {
  it('AC-039: a new plan of Nadja shows after "Jetzt abgleichen"', async () => {
    const engine = await fx.startEnrico();
    const before = engine.getSyncState().lastSyncedAt;
    await syncNow();
    expect(engine.getSyncState().lastSyncedAt).not.toBe(before);
  });

  it('AC-040: what waits in the store queue goes to the server before the pull', async () => {
    await fx.startEnrico();
    const items = getData()
      .items.filter((item) => !item.checked)
      .slice(0, 3);
    expect(items).toHaveLength(3);
    // The server struggles (503): the three checks wait in the queue for the next attempt.
    fx.server.failNext(
      'set_shopping_item_checked',
      new TransportError('transient', 'unavailable', 503),
    );
    for (const item of items) setItemChecked(item.id, true);
    await vi.waitFor(() =>
      expect(fx.server.calls.some((call) => call.fn === 'set_shopping_item_checked')).toBe(true),
    );
    fx.server.calls.length = 0;
    await syncNow();
    const order = fx.server.calls.map((call) => call.fn);
    const lastPull = order.lastIndexOf('sync_pull');
    const checks = order
      .map((fn, index) => (fn === 'set_shopping_item_checked' ? index : -1))
      .filter((index) => index >= 0);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...checks)).toBeLessThan(lastPull);
  });

  it('AC-041: a server error says so and the old time stays; offline it is refused', async () => {
    const engine = await fx.startEnrico();
    const before = engine.getSyncState().lastSyncedAt;
    fx.server.failNext('sync_pull', new TransportError('permanent', 'boom', 500));
    await expect(syncNow()).rejects.toThrow(SYNC_FAILED_MESSAGE);
    expect(SYNC_FAILED_MESSAGE).toBe(
      'Abgleich hat nicht geklappt – bitte später noch einmal versuchen.',
    );
    expect(engine.getSyncState().lastSyncedAt).toBe(before);
    engine.setSimulatedOffline(true);
    await expect(syncNow()).rejects.toBeInstanceOf(OfflineError);
  });
});

describe('Benachrichtigungen je Haushalt (REQ-008)', () => {
  it('AC-032: a switch changes only the row of the chosen household; the app stays where it is', async () => {
    await fx.startEnrico();
    const wg = await createHousehold('WG Köln');
    const homeBefore = getState().households[H]?.notificationSettings;
    fx.clearCalls();
    updateNotificationSettings({ dailySummaryEnabled: true }, wg);
    expect(getState().activeHouseholdId).toBe(H);
    expect(getState().households[wg]?.notificationSettings?.dailySummaryEnabled).toBe(true);
    await fx.settle();
    expect(fx.calls).toHaveLength(1);
    expect(fx.calls[0]?.args[0]).toBe(wg);
    expect(getState().households[H]?.notificationSettings).toEqual(homeBefore);
    expect(getState().households[wg]?.notificationSettings?.dailySummaryEnabled).toBe(true);
    expect(getState().activeHouseholdId).toBe(H);
  });

  it('AC-034: an unknown household changes nothing', async () => {
    await fx.startEnrico();
    expect(() => updateNotificationSettings({ dailySummaryEnabled: true }, 'fremd')).toThrow();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});
