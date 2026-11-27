// Spec 0067, REQ-001: "Normal" or "KI zuerst" per person — one RPC, shown at once, in the
// person's own row, never in another person's, refused offline.
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { setAppView } from './commands-view';
import { ENRICO, NADJA } from './seed/demo';
import { getData, OfflineError } from './store';

const fx = withBackend();

describe('setAppView (REQ-001)', () => {
  it('AC-002: a person starts with "Normal"', async () => {
    await fx.startEnrico();
    expect(getData().notificationSettings?.appView).toBe('normal');
  });

  it('AC-001: "KI zuerst" is shown at once, is one RPC and lands in his own row', async () => {
    await fx.startEnrico();
    setAppView('ai_first');
    expect(getData().notificationSettings?.appView).toBe('ai_first');
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'setAppView', args: ['ai_first'] }]);
    const own = fx.server.rows(H, 'notification_settings').find((row) => row.member_id === ENRICO);
    expect(own?.app_view).toBe('ai_first');
  });

  it("AC-002: Nadja's view stays hers", async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    setAppView('ai_first');
    await fx.settle(nadja);
    expect(fx.nadjaData(nadja).notificationSettings?.appView).toBe('normal');
    const hers = fx.server.rows(H, 'notification_settings').find((row) => row.member_id === NADJA);
    expect(hers?.app_view ?? 'normal').toBe('normal');
  });

  it('AC-003: offline the choice is refused and the view stays', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    expect(() => setAppView('ai_first')).toThrow(OfflineError);
    expect(getData().notificationSettings?.appView).toBe('normal');
  });
});
