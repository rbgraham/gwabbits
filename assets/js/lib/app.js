/* Application state singleton.

   One in-memory copy of the state, one write path, one change event. Because
   Turbo Drive swaps page bodies without reloading the document, this module
   stays alive across navigation — controllers reconnect, state doesn't reload.

   Controllers should `await ready` in connect(), then read `get()` and call
   `mutate()`. Nothing else writes to storage. */

import * as store from './store.js';
import { todayKey } from './dates.js';
import { evaluate } from './rules.js';

let state = null;
const listeners = new Set();

export const ready = (async () => {
  state = await store.load();
  state.lastOpened = new Date().toISOString();
  await store.save(state);
  return state;
})();

export function get() {
  if (!state) throw new Error('app.get() before ready — await ready first.');
  return state;
}

/** Apply a mutation, persist, and notify. `fn` mutates the state in place. */
export async function mutate(fn) {
  const result = fn(state);
  await store.save(state);
  emit();
  return result;
}

/** Derived scoring for right now. Recomputed on demand — never cached. */
export function snapshot() {
  return evaluate(get(), todayKey());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('Listener failed', err);
    }
  }
}

/** Replace everything — used by import and reset. */
export async function replace(next) {
  state = next;
  await store.save(state);
  emit();
}

export { store };
