import { describe, expect, it } from 'vitest';

import { routeId } from './ids';

// Ids from the address bar are input (deep links): only a uuid reaches a lookup, anything else is
// "nicht gefunden" — including names of Object.prototype that would otherwise resolve.
describe('routeId', () => {
  const id = 'c1437b0b-9d8a-50e6-b93b-6a826feaae34';

  it('a uuid in the address is the id; of a repeated parameter the first one counts', () => {
    expect(routeId(id)).toBe(id);
    expect(routeId([id, 'constructor'])).toBe(id);
  });

  it.each([
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    '',
    'act-eislaufen',
    `${id}/x`,
    `../${id}`,
    `${id} `,
  ])('refuses %j', (value) => {
    expect(routeId(value)).toBeUndefined();
    expect(routeId([value, id])).toBeUndefined();
  });

  it('no parameter is no id', () => {
    expect(routeId(undefined)).toBeUndefined();
    expect(routeId([])).toBeUndefined();
  });
});
