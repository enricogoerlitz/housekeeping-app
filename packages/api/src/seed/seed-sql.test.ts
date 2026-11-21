import { describe, expect, it } from 'vitest';

import { DEMO_HOUSEHOLD_ID, ENRICO, TEST_HOUSEHOLD_ID } from './demo';
import { generateSeed, SEED_NAMESPACE, seedHouseholdId, seedId, uuidV5 } from './seed-sql';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV5', () => {
  it('matches the RFC 9562 reference value for "www.example.com" in the DNS namespace', async () => {
    expect(await uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });
});

describe('seed ids', () => {
  it('derives households and members from the seed namespace', async () => {
    const id = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    expect(id).toBe(await uuidV5(DEMO_HOUSEHOLD_ID, SEED_NAMESPACE));
    expect(id).toMatch(UUID);
  });

  it('never gives the same slug the same id in two households', async () => {
    const demo = await seedId(DEMO_HOUSEHOLD_ID, 'slot-abend');
    expect(demo).toMatch(UUID);
    expect(await seedId(TEST_HOUSEHOLD_ID, 'slot-abend')).not.toBe(demo);
  });
});

describe('AC-033 (spec 0003): generated seed', async () => {
  const seed = await generateSeed('2026-11-20');

  it('is the same SQL whatever day it is generated on (all dates relative to the seed run)', async () => {
    for (const day of ['2026-11-16', '2026-11-22', '2027-01-31', '2027-02-28', '2027-06-01']) {
      expect((await generateSeed(day)).sql).toBe(seed.sql);
    }
  });

  it('writes no readable slug id and no fixed calendar date into the SQL', () => {
    expect(seed.sql).not.toMatch(
      /'(rec|art|area|plan|item|contrib|chore|list|store|act|slot|m|hh)-[a-z]/,
    );
    expect(seed.sql).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('inserts the activities before the plan entries that point to them (spec 0004)', () => {
    const activities = seed.sql.indexOf('insert into public.activities ');
    expect(activities).toBeGreaterThan(0);
    expect(seed.sql.indexOf('insert into public.activity_ratings ')).toBeGreaterThan(activities);
    expect(seed.sql.indexOf('insert into public.meal_plan_entries ')).toBeGreaterThan(activities);
    expect(seed.sql).toContain(
      'alter table public.activities disable trigger activities_set_timestamps;',
    );
  });

  it("spec 0011, AC-020: seed ratings were given in the past, so „Wie war's?“ asks for the recent entries again", () => {
    for (const table of ['recipe_ratings', 'restaurant_ratings', 'activity_ratings']) {
      const insert = new RegExp(
        `insert into public\\.${table} \\(([^)]*)\\) values\\n([\\s\\S]*?);\\n`,
      ).exec(seed.sql);
      const columns = (insert?.[1] ?? '').split(', ');
      expect(columns).toContain('updated_at');
      // updated_at (= ratedAt) is the rating's created_at, long before the plan entries.
      for (const line of (insert?.[2] ?? '').split('\n')) {
        const stamps = line.match(/now\(\) \+ make_interval\([^)]*\)/g) ?? [];
        expect(stamps).toHaveLength(2);
        expect(stamps[0]).toBe(stamps[1]);
        expect(stamps[0]).toContain('days => -120');
      }
    }
  });

  it('maps every slug to a UUID, with the demo members as the test accounts', async () => {
    const demo = seed.ids[DEMO_HOUSEHOLD_ID];
    expect(demo?.[ENRICO]).toBe(await seedHouseholdId(ENRICO));
    expect(demo?.['rec-mango-curry']).toBe(await seedId(DEMO_HOUSEHOLD_ID, 'rec-mango-curry'));
    expect(Object.values(demo ?? {}).every((id) => UUID.test(id))).toBe(true);
    expect(seed.sql).toContain("'enrico.test@example.com'");
    expect(seed.sql).toContain("'nadja.test@example.com'");
  });

  it('lists the e2e ids of the demo household and the test household', async () => {
    expect(seed.e2eIds['rec-mango-curry']).toBe(await seedId(DEMO_HOUSEHOLD_ID, 'rec-mango-curry'));
    expect(seed.e2eIds['hh-test']).toBe(await seedHouseholdId(TEST_HOUSEHOLD_ID));
    expect(seed.e2eIds['m-nadja']).toBeDefined();
    expect(seed.e2eIds['act-eislaufen']).toBe(await seedId(DEMO_HOUSEHOLD_ID, 'act-eislaufen'));
    expect(seed.e2eIds['slot-vormittag']).toBe(await seedId(DEMO_HOUSEHOLD_ID, 'slot-vormittag'));
    expect(seed.e2eTestIds['slot-vormittag']).toBe(
      await seedId(TEST_HOUSEHOLD_ID, 'slot-vormittag'),
    );
    // Nested ids (ingredients, steps, contributions) stay out of the e2e map.
    expect(Object.keys(seed.e2eIds).some((slug) => /-i\d+$/.test(slug))).toBe(false);
  });
});

describe('spec 0014, AC-014: preview seed', async () => {
  const seed = await generateSeed('2026-11-20');
  const preview = await generateSeed('2026-11-20', { accounts: 'preview' });
  const users = /insert into auth\.users \(([\s\S]*?)\) values\n([\s\S]*?);\n/.exec(preview.sql);

  it('is the same SQL whatever day it is generated on', async () => {
    expect((await generateSeed('2027-02-28', { accounts: 'preview' })).sql).toBe(preview.sql);
  });

  it('has no test accounts: no password, no identity, no @example.com, no test wording', () => {
    expect(preview.sql).not.toContain('encrypted_password');
    expect(preview.sql).not.toContain('crypt(');
    expect(preview.sql).not.toContain('local-test-password');
    expect(preview.sql).not.toContain('auth.identities');
    expect(preview.sql).not.toContain('@example.com');
    expect(preview.sql).not.toMatch(/test account|\(Test\)/i);
  });

  it('keeps the demo members as accounts on @vorschau.invalid, so cooks, raters and assignees stay valid', async () => {
    expect(users?.[2]).toContain("'enrico@vorschau.invalid'");
    expect(users?.[2]).toContain("'nadja@vorschau.invalid'");
    expect(users?.[2]).toContain('"full_name":"Beispiel-Enrico"');
    expect(users?.[2]).toContain('"full_name":"Beispiel-Nadja"');
    // Same ids as the local seed: the households refer to the members by them.
    expect(users?.[2]).toContain(`'${await seedHouseholdId(ENRICO)}'`);
    expect(preview.ids).toEqual(seed.ids);
  });

  it('carries the same households as the local seed', () => {
    const households = (sql: string) => sql.slice(sql.indexOf('-- Household "'));
    expect(households(preview.sql)).toBe(households(seed.sql));
    expect(preview.sql).toContain("'Enrico & Nadja'");
  });
});
