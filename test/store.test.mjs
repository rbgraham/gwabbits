/* Tests for backup parsing. The IndexedDB paths need a browser, but the
   validation logic — the part that decides whether to overwrite someone's
   entire history — is pure and worth pinning down. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SCHEMA_VERSION, blankState, parseImport } from '../assets/js/lib/store.js';

test('a blank state carries every key the app reads', () => {
  const s = blankState();
  for (const key of ['weeks', 'spins', 'punishments', 'reminders', 'spinResolvedThrough']) {
    assert.ok(key in s, `missing ${key}`);
  }
  assert.equal(s.punishments.length, 5);
  assert.equal(s.reminders.times.length, 2);
  assert.equal(s.firstRunComplete, false);
});

test('a valid backup round-trips', () => {
  const original = blankState();
  original.weeks['2026-08-10'] = { startDate: '2026-08-10', days: {}, penaltyActive: false };
  original.punishments[0] = 'Cold shower';

  const restored = parseImport(JSON.stringify(original));
  assert.deepEqual(Object.keys(restored.weeks), ['2026-08-10']);
  assert.equal(restored.punishments[0], 'Cold shower');
});

test('junk is rejected before it can overwrite anything', () => {
  assert.throws(() => parseImport('not json'), /valid JSON/);
  assert.throws(() => parseImport('{"hello":"world"}'), /Habits backup/);
  assert.throws(() => parseImport('null'), /Habits backup/);
  assert.throws(() => parseImport('{"weeks":null}'), /Habits backup/);
});

test('a backup from a newer version is refused rather than half-read', () => {
  const future = { ...blankState(), schemaVersion: SCHEMA_VERSION + 1 };
  assert.throws(() => parseImport(JSON.stringify(future)), /newer version/);
});

test('an older backup is migrated up, keeping its data', () => {
  const old = { schemaVersion: 1, weeks: { '2026-08-10': { days: {} } }, punishments: ['just one'] };
  const migrated = parseImport(JSON.stringify(old));

  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrated.punishments, ['just one'], 'user data wins over defaults');
  assert.ok(Array.isArray(migrated.spins), 'missing keys are backfilled');
  assert.ok(migrated.reminders);
});
