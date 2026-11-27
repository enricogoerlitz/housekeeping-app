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
export * from './commands-recipe-page';
export * from './commands-plan';
export * from './commands-shopping';
export * from './commands-chores';
export * from './commands-restaurants';
export * from './commands-activities';
export * from './commands-activity-series';
export * from './commands-recurring';
export * from './commands-places';
export * from './commands-packing';
export * from './commands-notices';
export * from './commands-view';
export * from './assistant';
export * from './ai';
export * from './ai-agent';
export { photoSource, useRecipeImage } from './photos';
export {
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
export { checkImageFile, loadPhotoFromAddress } from './photo-sources';
export {
  loadRecipeVideo,
  removeRecipeVideo,
  saveRecipeVideo,
  saveVideoPoster,
  VIDEO_LOAD_FAILED_MESSAGE,
  VIDEO_SAVE_FAILED_MESSAGE,
} from './recipe-video';
export { snapshot, OfflineError } from './store';
export { useAddressedObject, type AddressedKind } from './addressed';
export { useAppVersionState } from './app-version';
export {
  onWriteRejected,
  syncNow,
  unsentStoreChangeCount,
  useSyncState,
  WRITE_REJECTED_MESSAGE,
} from './backend';
export { TransportError } from './transport';
export {
  readAuthConfig,
  signInWithGoogle,
  signInWithTestAccount,
  signOut,
  startAuth,
  useAuth,
} from './auth';
export { TEST_ACCOUNTS, type TestAccountKey } from './dev-accounts';
export { useHouseholdInvitations, useHouseholdOwnerId, useMyInvitations } from './households';
export { starterCatalogEntries } from './starter/entries';
export * from './ai-recipes';
export * from './web-search';
