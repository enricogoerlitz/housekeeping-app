// Data interface of the app. Screens import hooks and commands from here and nothing else from
// this package. By default the data is the in-memory demo household (spec 0001); after
// `startBackend` it is the local cache of Supabase, kept current by the delta sync (spec 0003).
import './zod-config';
import './seed/demo';

export * from './queries';
export * from './commands-household';
export * from './commands-recipes';
export * from './commands-plan';
export * from './commands-shopping';
export * from './commands-chores';
export * from './commands-restaurants';
export * from './assistant';
export * from './ai';
export { photoSource } from './photos';
export { snapshot, resetState, OfflineError, type HouseholdData, type AppState } from './store';
export {
  browserEnvironment,
  onWriteRejected,
  resetLocalData,
  startBackend,
  stopBackend,
  useSyncState,
  WRITE_REJECTED_MESSAGE,
  type Environment,
  type StartBackendOptions,
  type SyncState,
} from './backend';
export { createIndexedDbStorage, createMemoryStorage, type Storage } from './storage';
export {
  NOT_INVITED_MESSAGE,
  readAuthConfig,
  SIGN_IN_FAILED_MESSAGE,
  signInWithGoogle,
  signInWithTestAccount,
  signOut,
  startAuth,
  useAuth,
  type AuthConfig,
  type AuthState,
  type AuthUser,
  type PublicEnv,
  type SessionStorage,
} from './auth';
export { TEST_ACCOUNTS, type TestAccount, type TestAccountKey } from './dev-accounts';
export { useHouseholdInvitations, useMyInvitations, type Invitation } from './households';
export { starterAreas } from './starter/areas';
export { starterCatalog } from './starter/catalog';
export { DEMO_HOUSEHOLD_ID, TEST_HOUSEHOLD_ID } from './seed/demo';
