// The photo storage against the running local stack (spec 0004, REQ-004): the Supabase transport
// uploads, downloads and deletes in household-media, and the Storage API's refusals arrive as the
// codes the photo flow maps to German messages. Skipped unless SUPABASE_LOCAL=1, e.g.
//
//   pnpm db:reset
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/photos-remote.integration.test.ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { DEMO_HOUSEHOLD_ID } from './seed/demo';
import { seedHouseholdId, seedId } from './seed/seed-sql';
import { createSupabaseTransport, fromSupabaseClient } from './transport-supabase';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const enabled = env?.SUPABASE_LOCAL === '1';
const url = env?.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const jpeg = (size: number) =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(size)], {
    type: 'image/jpeg',
  });

describe.skipIf(!enabled)('photo storage in the local stack', () => {
  it('AC-009 / AC-012: stores, refuses with the mapped codes, links and deletes', async () => {
    const account = TEST_ACCOUNTS[0];
    if (!url || !key || !account) throw new Error('local stack configuration missing');
    const client = createClient(url, key, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({
      email: account.email,
      password: TEST_PASSWORD,
    });
    expect(signIn.error).toBeNull();
    const transport = createSupabaseTransport(fromSupabaseClient(client));
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const activityId = await seedId(DEMO_HOUSEHOLD_ID, 'act-eislaufen');
    const folder = `${householdId}/activities/${activityId}`;
    const path = `${folder}/${crypto.randomUUID()}.jpg`;

    try {
      await transport.uploadMedia(path, jpeg(1000));
      expect((await transport.downloadMedia(path)).size).toBe(1004);
      // Stored with max-age=0, so no browser or CDN keeps a copy (security check 0004).
      const info = await client.storage.from('household-media').info(path);
      expect(info.data?.cacheControl).toBe('max-age=0');
      await expect(
        transport.uploadMedia(`${folder}/eislaufen.jpg`, jpeg(10)),
      ).rejects.toMatchObject({ kind: 'permanent', code: 'access_denied' });
      await expect(transport.uploadMedia(path, jpeg(10))).rejects.toMatchObject({
        kind: 'permanent',
        code: 'already_exists',
      });
      await expect(
        transport.uploadMedia(
          `${folder}/${crypto.randomUUID()}.jpg`,
          new Blob(['<svg/>'], { type: 'image/svg+xml' }),
        ),
      ).rejects.toMatchObject({ kind: 'permanent', code: 'invalid_mime' });
      await expect(
        transport.uploadMedia(`${folder}/${crypto.randomUUID()}.jpg`, jpeg(2 * 1024 * 1024)),
      ).rejects.toMatchObject({ kind: 'permanent', code: 'too_large' });
      const foreign = `${crypto.randomUUID()}/activities/${activityId}/${crypto.randomUUID()}.jpg`;
      await expect(transport.uploadMedia(foreign, jpeg(10))).rejects.toMatchObject({
        kind: 'permanent',
        code: 'access_denied',
      });
      await expect(transport.downloadMedia(`${folder}/missing.jpg`)).rejects.toMatchObject({
        kind: 'permanent',
      });

      await transport.applyChanges(householdId, [
        { kind: 'patch', table: 'activities', id: activityId, changes: { photo_path: path } },
      ]);
      await expect(
        transport.applyChanges(householdId, [
          {
            kind: 'patch',
            table: 'activities',
            id: activityId,
            changes: { photo_path: `${householdId}/recipes/${activityId}/x.jpg` },
          },
        ]),
      ).rejects.toMatchObject({ kind: 'permanent', code: '23514' });
    } finally {
      await transport.applyChanges(householdId, [
        { kind: 'patch', table: 'activities', id: activityId, changes: { photo_path: null } },
      ]);
      await transport.removeMedia([path]);
    }
    await expect(transport.downloadMedia(path)).rejects.toMatchObject({ kind: 'permanent' });
    await client.auth.signOut();
  });
});
