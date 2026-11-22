import { describe, expect, it } from 'vitest';

import {
  APP_VERSION_DEV,
  APP_VERSION_PREVIEW,
  appVersionState,
  compareAppVersions,
  editLockReason,
  formatAppVersion,
  nextAppVersion,
  parseAppVersion,
} from './app-version';

describe('parseAppVersion', () => {
  it('reads JJJJ.M.N', () => {
    expect(parseAppVersion('2026.12.4')).toEqual({ year: 2026, month: 12, sequence: 4 });
    expect(parseAppVersion('2027.1.1')).toEqual({ year: 2027, month: 1, sequence: 1 });
    expect(parseAppVersion('2026.1.123')).toEqual({ year: 2026, month: 1, sequence: 123 });
  });

  it('rejects everything that is not exactly JJJJ.M.N', () => {
    for (const value of [
      '',
      'dev',
      'vorschau',
      'v2026.12.4', // a tag, not a version
      '2026.12',
      '2026.12.4.1',
      '2026.01.1', // leading zero in the month
      '2026.12.04', // leading zero in the number
      '2026.0.1',
      '2026.13.1',
      '2026.12.0',
      '26.12.1',
      '12026.12.1',
      ' 2026.12.4',
      '2026.12.4 ',
      '2026.12.4-rc',
      '2026.12.99999999999999999999', // beyond a safe integer
    ]) {
      expect(parseAppVersion(value), value).toBeNull();
    }
  });
});

describe('formatAppVersion', () => {
  it('writes the month and the number without leading zeros', () => {
    expect(formatAppVersion({ year: 2027, month: 1, sequence: 1 })).toBe('2027.1.1');
    expect(formatAppVersion({ year: 2026, month: 12, sequence: 10 })).toBe('2026.12.10');
  });
});

describe('compareAppVersions', () => {
  it('orders by year, then month, then number — numerically, not as text', () => {
    expect(compareAppVersions('2026.12.4', '2026.12.4')).toBe(0);
    expect(compareAppVersions('2026.12.4', '2026.12.5')).toBeLessThan(0);
    expect(compareAppVersions('2026.12.10', '2026.12.9')).toBeGreaterThan(0);
    expect(compareAppVersions('2026.9.1', '2026.10.1')).toBeLessThan(0);
    expect(compareAppVersions('2027.1.1', '2026.12.99')).toBeGreaterThan(0);
  });

  it('AC-026: a minimum version 2026.12.9 lies after the released 2026.12.4', () => {
    expect(compareAppVersions('2026.12.9', '2026.12.4')).toBeGreaterThan(0);
  });

  it('throws on an invalid version instead of guessing an order', () => {
    expect(() => compareAppVersions('dev', '2026.12.4')).toThrow('Ungültige Version „dev“');
    expect(() => compareAppVersions('2026.12.4', 'v2026.12.4')).toThrow(
      'Ungültige Version „v2026.12.4“',
    );
  });
});

describe('nextAppVersion', () => {
  const december = new Date('2026-12-10T12:00:00Z');

  it('AC-018: after 2026.12.3 the next release in December 2026 is 2026.12.4', () => {
    expect(nextAppVersion(['v2026.12.1', 'v2026.12.3', 'v2026.12.2'], december)).toBe('2026.12.4');
  });

  it('AC-018: the first release in January 2027 is 2027.1.1', () => {
    expect(nextAppVersion(['v2026.12.3'], new Date('2027-01-05T12:00:00Z'))).toBe('2027.1.1');
  });

  it('AC-018: the first release ever is number 1 of the month', () => {
    expect(nextAppVersion([], new Date('2026-11-21T12:00:00Z'))).toBe('2026.11.1');
  });

  it('AC-018: counts numerically past 9', () => {
    expect(nextAppVersion(['v2026.12.9', 'v2026.12.10'], december)).toBe('2026.12.11');
  });

  it('AC-018: the month changes at midnight Berlin time, not UTC (winter time, UTC+1)', () => {
    expect(nextAppVersion(['v2026.12.3'], new Date('2026-12-31T22:59:59Z'))).toBe('2026.12.4');
    expect(nextAppVersion(['v2026.12.3'], new Date('2026-12-31T23:00:00Z'))).toBe('2027.1.1');
  });

  it('AC-018: the month changes at midnight Berlin time, not UTC (summer time, UTC+2)', () => {
    expect(nextAppVersion(['v2026.6.2'], new Date('2026-06-30T21:59:59Z'))).toBe('2026.6.3');
    expect(nextAppVersion(['v2026.6.2'], new Date('2026-06-30T22:00:00Z'))).toBe('2026.7.1');
  });

  it('ignores tags that are not a release tag v<JJJJ.M.N>', () => {
    expect(
      nextAppVersion(
        ['2026.12.7', 'v2026.12.07', 'v2026.12.8-rc', 'release', 'v2026.12.2'],
        december,
      ),
    ).toBe('2026.12.3');
  });

  it('throws when a release already lies after the current month, so versions never go back', () => {
    expect(() => nextAppVersion(['v2027.1.1'], december)).toThrow(
      'Version 2027.1.1 liegt nach dem aktuellen Monat 2026.12',
    );
  });

  it('throws on an invalid date', () => {
    expect(() => nextAppVersion([], new Date(Number.NaN))).toThrow('Ungültiges Datum');
  });
});

describe('appVersionState', () => {
  it('is "aktuell" when the own version is the latest and the minimum is met', () => {
    expect(appVersionState({ own: '2026.12.4', latest: '2026.12.4', min: '2026.12.2' })).toBe(
      'aktuell',
    );
    expect(appVersionState({ own: '2026.12.4', latest: '2026.12.4', min: '2026.12.4' })).toBe(
      'aktuell',
    );
  });

  it('is "neu-verfuegbar" when a newer version is published', () => {
    expect(appVersionState({ own: '2026.12.4', latest: '2026.12.5', min: '2026.1.1' })).toBe(
      'neu-verfuegbar',
    );
    expect(appVersionState({ own: '2026.12.9', latest: '2026.12.10', min: null })).toBe(
      'neu-verfuegbar',
    );
  });

  it('is "aktuell" when the published version is older (a rolled-back web build)', () => {
    expect(appVersionState({ own: '2026.12.5', latest: '2026.12.4', min: '2026.1.1' })).toBe(
      'aktuell',
    );
  });

  it('AC-025: below the minimum version the app is "nicht-unterstuetzt", even with a newer one out', () => {
    expect(appVersionState({ own: '2026.12.4', latest: '2026.12.5', min: '2026.12.5' })).toBe(
      'nicht-unterstuetzt',
    );
    expect(appVersionState({ own: '2026.12.4', latest: null, min: '2026.12.5' })).toBe(
      'nicht-unterstuetzt',
    );
  });

  it('AC-023: without server values (offline) there is neither a hint nor a lock', () => {
    expect(appVersionState({ own: '2026.12.4', latest: null, min: null })).toBe('aktuell');
  });

  it('dev and vorschau get no hint and are never locked', () => {
    for (const own of [APP_VERSION_DEV, APP_VERSION_PREVIEW]) {
      expect(appVersionState({ own, latest: '2026.12.5', min: '2026.12.5' }), own).toBe('aktuell');
    }
  });

  it('ignores invalid server values instead of locking or hinting', () => {
    expect(appVersionState({ own: '2026.12.4', latest: 'vorschau', min: 'kaputt' })).toBe(
      'aktuell',
    );
    expect(appVersionState({ own: '2026.12.4', latest: '', min: '' })).toBe('aktuell');
  });

  it('never locks or hints for an own version it cannot read', () => {
    expect(appVersionState({ own: '', latest: '2026.12.5', min: '2026.12.5' })).toBe('aktuell');
    expect(appVersionState({ own: '2026.12', latest: '2026.12.5', min: '2026.12.5' })).toBe(
      'aktuell',
    );
  });
});

describe('editLockReason: why edit actions are greyed out (spec 0018, AC-023)', () => {
  it('AC-023: below the minimum version and online it is the version, not the network', () => {
    expect(
      editLockReason({ writesLocked: true, networkOffline: false, version: 'nicht-unterstuetzt' }),
    ).toBe('version');
  });

  it('AC-023: offline it stays the network, also below the minimum version', () => {
    expect(
      editLockReason({ writesLocked: true, networkOffline: true, version: 'nicht-unterstuetzt' }),
    ).toBe('offline');
    expect(editLockReason({ writesLocked: true, networkOffline: true, version: 'aktuell' })).toBe(
      'offline',
    );
  });

  it('AC-023: nothing locked, no reason', () => {
    expect(
      editLockReason({ writesLocked: false, networkOffline: false, version: 'neu-verfuegbar' }),
    ).toBeUndefined();
  });

  it('a lock with no known cause reads as offline, the hint the app always had', () => {
    expect(editLockReason({ writesLocked: true, networkOffline: false, version: 'aktuell' })).toBe(
      'offline',
    );
  });
});
