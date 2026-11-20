// Local test accounts (spec 0003, REQ-002). They exist only in the local seed
// (`supabase/seed.sql`); the app offers them only when built with EXPO_PUBLIC_DEV_LOGIN=1 against a
// local Supabase (AC-007).

export type TestAccountKey = 'enrico' | 'nadja';

export interface TestAccount {
  key: TestAccountKey;
  email: string;
  name: string;
}

export const TEST_ACCOUNTS: readonly TestAccount[] = [
  { key: 'enrico', email: 'enrico.test@example.com', name: 'Enrico (Test)' },
  { key: 'nadja', email: 'nadja.test@example.com', name: 'Nadja (Test)' },
];

/** A fixed fake value for local tests only, not a secret (example.com is reserved). */
export const TEST_PASSWORD = 'local-test-password';
