import { describe, expect, it } from 'vitest';

import { APP_NAME } from './index';

// Pipeline smoke test: proves the workspace test setup runs. Delete it once the first real
// domain test exists.
describe('core package', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('Housekeeping');
  });
});
