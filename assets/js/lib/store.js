/* Persistence.

   IndexedDB, not localStorage: localStorage is synchronous, string-only, and
   capped small. The whole state is a few kilobytes, so we read it once into
   memory and write it back whole on each mutation — no partial-update bugs.

   Safari evicts site storage after ~7 days without a visit, which is why
   export/import exists and why we ask for persistent storage on first save. */

const DB_NAME = 'habits';
const DB_VERSION = 1;
const STORE = 'state';
const KEY = 'singleton';

export const SCHEMA_VERSION = 1;

export const DEFAULT_PUNISHMENTS = [
  '50 burpees, right now.',
  'Cold shower. Full five minutes.',
  'No caffeine tomorrow.',
  '10km. Today.',
  'Donate £20 to a cause you despise.',
];

export function blankState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    firstRunComplete: false,
    weeks: {},
    spins: [],
    punishments: [...DEFAULT_PUNISHMENTS],
    reminders: { enabled: false, times: ['09:00', '18:00'] },
    spinResolvedThrough: '',
    lastOpened: null,
  };
}

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function load() {
  try {
    const stored = await tx('readonly', (s) => s.get(KEY));
    return stored ? migrate(stored) : blankState();
  } catch (err) {
    // A corrupt or blocked database must not white-screen the app.
    console.error('Could not read saved data; starting empty.', err);
    return blankState();
  }
}

export async function save(state) {
  await tx('readwrite', (s) => s.put(state, KEY));
  return state;
}

/** Bring older payloads up to the current schema. */
function migrate(state) {
  const next = { ...blankState(), ...state };
  next.schemaVersion = SCHEMA_VERSION;
  return next;
}

/* --- Durability ---------------------------------------------------------- */

/** Ask the browser not to evict us. Best-effort; Safari often declines. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/* --- Export / import ----------------------------------------------------- */

export function exportBlob(state) {
  const payload = { ...state, exportedAt: new Date().toISOString() };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export function exportFilename() {
  return `habits-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Parse and sanity-check an imported file. Throws with a readable message. */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!data || typeof data !== 'object' || typeof data.weeks !== 'object' || data.weeks === null) {
    throw new Error("That doesn't look like a Habits backup.");
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('That backup was made by a newer version of the app.');
  }
  return migrate(data);
}

export async function wipe() {
  await tx('readwrite', (s) => s.delete(KEY));
}
