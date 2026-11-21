import { describe, expect, it } from 'vitest';

import { isPushEndpoint } from './push-endpoint.ts';

// The same cases as private.is_push_endpoint in pgTAP (AC-044): push-send checks the address a
// second time before any fetch, so a row that slipped past the database still goes nowhere.
describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/dGVzdA:APA91b-x_y',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk-test',
    'https://web.push.apple.com/QGx1Y2t5LXRva2Vu',
    'https://wns2-db5p.notify.windows.com/w/?token=BQYAAAB%2Bk',
    'https://db5p.notify.windows.com/w/',
  ])('AC-044: accepts a known push service: %s', (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/x'],
    ['loopback with port', 'https://127.0.0.1:54321/functions/v1/x'],
    ['internal host', 'https://kong:8000/x'],
    ['explicit port', 'https://fcm.googleapis.com:443/fcm/send/x'],
    ['credentials', 'https://user:pw@fcm.googleapis.com/fcm/send/x'],
    ['look-alike host', 'https://fcm.googleapis.com.evil.example/x'],
    ['known name only in the path', 'https://evil.example/fcm.googleapis.com/x'],
    ['bare notify.windows.com', 'https://notify.windows.com/w/'],
    ['upper case host', 'https://FCM.googleapis.com/fcm/send/x'],
    ['no path', 'https://fcm.googleapis.com'],
    ['fragment', 'https://fcm.googleapis.com/fcm/send/x#y'],
    ['backslash', 'https://fcm.googleapis.com\\@evil.example/x'],
    ['whitespace', 'https://fcm.googleapis.com/fcm/send/x y'],
    ['trailing newline', 'https://fcm.googleapis.com/fcm/send/x\n'],
    ['longer than 1024', `https://fcm.googleapis.com/${'a'.repeat(1000)}`],
    ['empty', ''],
  ])('AC-044: refuses %s', (_label, endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false);
  });

  it('AC-044: accepts exactly 1024 characters', () => {
    const prefix = 'https://fcm.googleapis.com/';
    expect(isPushEndpoint(prefix + 'a'.repeat(1024 - prefix.length))).toBe(true);
  });
});
