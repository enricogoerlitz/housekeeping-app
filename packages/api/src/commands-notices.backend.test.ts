// Acknowledging in-app notices (spec 0051, REQ-004, REQ-005): one RPC per tap, shown at once,
// refused offline, synced to the person's other devices, never into another person's row.
import { describe, expect, it } from 'vitest';

import { createEngine } from './backend';
import { H, withBackend } from './backend-test-helpers';
import { acknowledgeNotices } from './commands-notices';
import { ENRICO, NADJA } from './seed/demo';
import { createMemoryStorage } from './storage';
import { getData, getState, OfflineError } from './store';

const fx = withBackend();

const today = () => getState().today;
const muell = () => `chore:c-muell:${today()}`;
const pizza = () => `entry:e-pizza:0-1730:${today()}`;

describe('acknowledgeNotices (REQ-004, REQ-005)', () => {
  it('REQ-005: a member starts with nothing acknowledged', async () => {
    await fx.startEnrico();
    expect(getData().notificationSettings?.acknowledgedNotices).toEqual([]);
  });

  it('AC-018: one tap is shown at once and is one RPC; the other device gets it', async () => {
    await fx.startEnrico();
    acknowledgeNotices([muell()]);
    expect(getData().notificationSettings?.acknowledgedNotices).toEqual([muell()]);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'acknowledgeNotices', args: [H, [muell()]] }]);
    const own = fx.server.rows(H, 'notification_settings').find((row) => row.member_id === ENRICO);
    expect(own?.acknowledged_notices).toEqual([muell()]);

    const second = createEngine({
      transport: fx.server.transport(ENRICO),
      storage: createMemoryStorage(),
      userId: ENRICO,
      environment: fx.environment,
    });
    try {
      await second.start();
      await fx.settle(second);
      expect(second.getState()?.households[H]?.notificationSettings?.acknowledgedNotices).toEqual([
        muell(),
      ]);
    } finally {
      second.stop();
    }
  });

  it('AC-019: "Alle bestätigen" sends every key in one call and keeps the earlier ones', async () => {
    await fx.startEnrico();
    acknowledgeNotices([muell()]);
    await fx.settle();
    acknowledgeNotices([pizza(), muell()]);
    expect([...(getData().notificationSettings?.acknowledgedNotices ?? [])].sort()).toEqual(
      [muell(), pizza()].sort(),
    );
    await fx.settle();
    const own = fx.server.rows(H, 'notification_settings').find((row) => row.member_id === ENRICO);
    expect([...((own?.acknowledged_notices as string[]) ?? [])].sort()).toEqual(
      [muell(), pizza()].sort(),
    );
  });

  it('AC-022: Nadja\'s row stays as it was', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    acknowledgeNotices([muell()]);
    await fx.settle(nadja);
    expect(fx.nadjaData(nadja).notificationSettings?.acknowledgedNotices).toEqual([]);
    const hers = fx.server.rows(H, 'notification_settings').find((row) => row.member_id === NADJA);
    expect(hers?.acknowledged_notices).toEqual([]);
  });

  it('AC-020: offline it is refused and nothing changes', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    expect(() => acknowledgeNotices([muell()])).toThrow(OfflineError);
    expect(getData().notificationSettings?.acknowledgedNotices).toEqual([]);
  });

  it('AC-024: an invalid key or more than 100 at once is refused before sending', async () => {
    await fx.startEnrico();
    expect(() => acknowledgeNotices(['x'])).toThrow();
    const many = Array.from({ length: 101 }, (_, index) => `cook:k${index}:${today()}`);
    expect(() => acknowledgeNotices(many)).toThrow();
    expect(() => acknowledgeNotices([])).not.toThrow();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-024: the server refuses another household (not_found)', async () => {
    await fx.startEnrico();
    await expect(
      fx.server.transport(NADJA).acknowledgeNotices('fremd', [muell()]),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      fx.server.transport(ENRICO).acknowledgeNotices(H, ['x']),
    ).rejects.toMatchObject({ code: 'invalid_notice' });
  });
});
