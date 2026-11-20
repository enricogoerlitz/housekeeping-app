import { readAuthConfig } from '@housekeeping/api';

// Expo inlines EXPO_PUBLIC_* values only for static `process.env.NAME` reads, so they are read
// here, in app code. A missing value or the developer switch against a non-local Supabase stops
// the app at start (rule 10-security, AC-007).
export const authConfig = readAuthConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_DEV_LOGIN: process.env.EXPO_PUBLIC_DEV_LOGIN,
});
