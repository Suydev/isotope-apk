import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGraph } from '../scripts/www-graph.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'www', 'assets');
const GRAPH = resolveGraph();
const FOCUS_STORE = 'useFocusStore-BL5hTjFF.js';

function readAsset(name) {
  return fs.readFileSync(path.join(ASSETS, name), 'utf8');
}

// Regression: Focus page crash — "Cannot read properties of undefined
// (reading 'length')" in useFocusStore ft() when a session row has no
// subjectIds array (cloud-synced study_sessions_log rows, or any
// session shape that pre-dates the field).
//
// The fix is a one-line guard in the baked bundle:
//   i.subjectIds.length>0  →  (i.subjectIds||[]).length>0
//
// These tests pin the fix by anchor (cheap, no esbuild dependency) so a
// future re-capture that overwrites the bundle fails loudly here.

test('useFocusStore ft() guards against missing subjectIds', () => {
  const src = readAsset(FOCUS_STORE);
  assert.ok(
    src.includes('(i.subjectIds||[]).length>0?i.subjectIds:i.subjectId?[i.subjectId]:[]'),
    'the guarded ft() shape is missing — the crash fix was not applied',
  );
});

test('the unguarded i.subjectIds.length read in ft() is gone', () => {
  const src = readAsset(FOCUS_STORE);
  assert.ok(
    !/i\.subjectIds\.length>0\?i\.subjectIds/i.test(src),
    'unguarded i.subjectIds.length read still present in ' + FOCUS_STORE,
  );
});

test('undoLastQuestionResult guards questionActionHistory', () => {
  const src = readAsset(FOCUS_STORE);
  assert.ok(
    src.includes('(e.questionActionHistory||[])'),
    'undoLastQuestionResult does not guard questionActionHistory',
  );
});

test('cloud-synced session row shape is normalised in restore-and-launch', () => {
  const src = fs.readFileSync(path.join(ROOT, 'www', 'restore-and-launch.js'), 'utf8');
  // sessionLogRowsToLocal must emit subjectIds/chapterIds/topicIds/taskIds
  // so merged rows carry the arrays the live Focus code expects.
  assert.ok(
    src.includes('subjectIds: [],') && src.includes('chapterIds: [],') &&
    src.includes('topicIds: [],') && src.includes('taskIds: [],'),
    'sessionLogRowsToLocal does not emit the subjectIds/chapterIds/topicIds/' +
    'taskIds arrays — merged cloud rows would still crash Focus',
  );
});

test('FOCUS_STORE bundle is reachable (guards are not in an orphaned file)', () => {
  assert.ok(
    GRAPH.reachable.has(FOCUS_STORE),
    `www/assets/${FOCUS_STORE} is orphaned — the guards live in a file the app ` +
    'never loads; re-point them at the live bundle (see AGENTS.md).',
  );
});

test('recordQuestionResult guards the questionActionHistory spread', () => {
  const src = readAsset(FOCUS_STORE);
  assert.ok(
    src.includes('[...(t.questionActionHistory??[]),'),
    'recordQuestionResult spreads an unguarded questionActionHistory',
  );
  assert.ok(
    !src.includes('[...t.questionActionHistory,'),
    'unguarded questionActionHistory spread still present',
  );
});

test('undoLastQuestionResult guards the questionActionHistory slice', () => {
  const src = readAsset(FOCUS_STORE);
  assert.ok(
    src.includes('questionActionHistory:(e.questionActionHistory??[]).slice(0,-1)'),
    'undoLastQuestionResult slices an unguarded questionActionHistory',
  );
  assert.ok(
    !src.includes('questionActionHistory:e.questionActionHistory.slice(0,-1)'),
    'unguarded questionActionHistory slice still present',
  );
});
