import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'www', 'sync', 'local-data-adapter.js'), 'utf8');

// Regression: "sync not working" — a backup built from the local adapter was
// missing anything added since the last restore.
//
// readCollection used to read IndexedDB first and only fall back to localStorage.
// The live app (Zustand) writes rows straight to localStorage, while IndexedDB is
// only refreshed on restore/sync, so IDB goes stale — every built backup silently
// dropped post-restore data. Every IDB write is paired with a localStorage write,
// so preferring localStorage (when present) is always at least as fresh.

test('readCollection prefers the live localStorage copy over stale IndexedDB', () => {
  const arrow = SRC.indexOf('async function readCollection');
  assert.ok(arrow !== -1, 'readCollection must exist');
  // The localStorage read must happen BEFORE the fromDb return, with the
  // localStorage-first branch returning when non-empty.
  const localReadIdx = SRC.indexOf('const local = readJson(key, [])', arrow);
  const dbReturnIdx = SRC.indexOf('fromDb.length > 0', arrow);
  assert.ok(localReadIdx !== -1 && dbReturnIdx !== -1,
    'readCollection must read localStorage and IndexedDB');
  assert.ok(localReadIdx < dbReturnIdx,
    'readCollection must consult localStorage before returning IndexedDB data, ' +
    'otherwise a stale IDB snapshot wins and the built backup drops live edits');
  assert.ok(SRC.includes('Array.isArray(local) && local.length > 0'),
    'the localStorage-first branch must guard on a non-empty array');
});

test('session rows are normalized to carry array fields on read', () => {
  assert.ok(SRC.includes("name === 'sessions' ? local.map(normalizeSessionArrays)"),
    'readCollection must normalize session arrays when reading localStorage');
  assert.ok(SRC.includes("name === 'sessions' ? fromDb.map(normalizeSessionArrays)"),
    'readCollection must normalize session arrays when reading IndexedDB');
});

test('session rows are normalized on write via normalizeRecordForStore', () => {
  assert.ok(SRC.includes("if (collection === 'sessions') normalizeSessionArrays(next);"),
    'normalizeRecordForStore must normalize session arrays before persisting');
});
