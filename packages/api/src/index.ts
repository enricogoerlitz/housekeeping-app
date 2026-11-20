// Data interface of the app. Screens import hooks and commands from here and nothing else from
// this package. Today the data behind it is an in-memory demo household (spec 0001); later
// specs replace the inside with Supabase and the delta sync without changing these exports.
import './seed/demo';

export * from './queries';
export * from './commands-household';
export * from './commands-recipes';
export * from './commands-plan';
export * from './commands-shopping';
export * from './commands-chores';
export * from './commands-restaurants';
export * from './assistant';
export { photoSource } from './photos';
export { snapshot, resetState, type HouseholdData, type AppState } from './store';
export { starterAreas } from './starter/areas';
export { starterCatalog } from './starter/catalog';
export { DEMO_HOUSEHOLD_ID, TEST_HOUSEHOLD_ID } from './seed/demo';
