// Data interface of the app. Screens import hooks and commands from here and nothing else from
// this package. The data is the local cache of Supabase, kept current by the delta sync
// (spec 0003); it exists once `startBackend` ran for the signed-in user.
import './zod-config';

export * from './queries';
export * from './commands-household';
export * from './commands-trips';
export * from './commands-articles';
export * from './commands-stores';
export * from './commands-recipes';
export * from './commands-collections';
export * from './commands-plan';
export * from './commands-shopping';
export * from './commands-chores';
export * from './commands-restaurants';
export * from './commands-activities';
export * from './commands-places';
export * from './commands-packing';
export * from './commands-notifications';
export * from './assistant';
export * from './ai';
export { photoSource, useRecipeImage } from './photos';
export {
  PHOTO_FORBIDDEN_MESSAGE,
  PHOTO_MAX_INPUT_BYTES,
  PHOTO_UNUSABLE_MESSAGE,
  PHOTO_UPLOAD_FAILED_MESSAGE,
  preparePhoto,
  removeActivityPhoto,
  removeRecipePhoto,
  removeRestaurantPhoto,
  setActivityPhoto,
  setRecipePhoto,
  setRestaurantPhoto,
  usePhoto,
} from './photos-remote';
export { snapshot, OfflineError, type HouseholdData, type AppState } from './store';
export {
  addressedIn,
  useAddressedObject,
  type AddressedKind,
  type AddressedObject,
} from './addressed';
export { useAppVersionState } from './app-version';
export {
  browserEnvironment,
  onWriteRejected,
  resetLocalData,
  startBackend,
  stopBackend,
  syncNow,
  SYNC_FAILED_MESSAGE,
  unsentStoreChangeCount,
  useSyncState,
  WRITE_REJECTED_MESSAGE,
  type Environment,
  type StartBackendOptions,
  type SyncState,
} from './backend';
export { TransportError } from './transport';
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
export { starterCatalogEntries } from './starter/entries';
