// Device storage for the local cache and the store queue (docs/architecture/sync.md). The sync
// engine only sees this interface; web uses IndexedDB, tests use memory, native gets its own
// implementation later.
import { clear, createStore, delMany, get, setMany } from 'idb-keyval';

export interface Storage {
  get(key: string): Promise<unknown>;
  /** Writes all entries in one transaction: either all are stored or none. */
  setMany(entries: readonly (readonly [string, unknown])[]): Promise<void>;
  del(keys: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}

/** In memory, for tests and until native storage exists. Values are copied like IndexedDB does. */
export function createMemoryStorage(): Storage {
  const values = new Map<string, unknown>();
  return {
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : undefined;
    },
    async setMany(entries) {
      // Clone everything first, so a value that cannot be stored leaves nothing half-written.
      const copies = entries.map(([key, value]) => [key, structuredClone(value)] as const);
      for (const [key, value] of copies) values.set(key, value);
    },
    async del(keys) {
      for (const key of keys) values.delete(key);
    },
    async clear() {
      values.clear();
    },
  };
}

/** IndexedDB in the browser (`idb-keyval`): one database, one object store, one transaction per call. */
export function createIndexedDbStorage(databaseName = 'housekeeping'): Storage {
  const store = createStore(databaseName, 'cache');
  return {
    get: (key) => get(key, store),
    setMany: (entries) =>
      setMany(
        entries.map(([key, value]) => [key, value]),
        store,
      ),
    del: (keys) => delMany([...keys], store),
    clear: () => clear(store),
  };
}
