import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGraph } from '../scripts/www-graph.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'www', 'assets');
const GRAPH = resolveGraph();

function readAsset(name) {
  return fs.readFileSync(path.join(ASSETS, name), 'utf8');
}

function assertReachable(file) {
  assert.ok(
    GRAPH.reachable.has(file),
    `www/assets/${file} is NOT reachable from index.html's entry script, so ` +
    'asserting a guard anchor in it proves nothing about the shipped app. ' +
    'Re-point or re-capture it (see AGENTS.md "Patch anchor checklist").',
  );
}

// Regression: "Cannot read properties of undefined (reading 'includes')" on the
// Dashboard when a cloud-synced study_sessions_log row (or a question/resource,
// or a persisted focus session without an arrays field) reaches the UI without
// the expected arrays. Every unguarded live read that surfaced in a graph-wide
// sweep is pinned here so a future re-capture that reverts a guard fails loudly.

test('Dashboard guards subjectIds.includes on completed sessions (both sites)', () => {
  assertReachable('Dashboard-Dzf-IC_a.js');
  const src = readAsset('Dashboard-Dzf-IC_a.js');
  assert.ok(src.includes('(S.subjectIds||[]).includes(s.id)'), 'site 1 guarded');
  assert.ok(!src.includes('S.subjectIds.includes(s.id)'), 'site 1 unguarded form gone');
  assert.ok(src.includes('(R?.subjectIds||[]).includes(t.id)'), 'site 2 guarded');
  assert.ok(!src.includes('R?.subjectIds.includes(t.id)'), 'site 2 unguarded form gone');
});

test('Dashboard guards subjectIds.length when building subject ids', () => {
  assertReachable('Dashboard-Dzf-IC_a.js');
  const src = readAsset('Dashboard-Dzf-IC_a.js');
  assert.ok(src.includes('(o.subjectIds||[]).length>0?o.subjectIds:'));
  assert.ok(!src.includes('o.subjectIds.length>0?o.subjectIds:'));
});

test('AnalyticsToday guards subjectIds.forEach', () => {
  assertReachable('AnalyticsToday-BTv1jnKt.js');
  const src = readAsset('AnalyticsToday-BTv1jnKt.js');
  assert.ok(src.includes('(h.subjectIds||[]).forEach(m=>{'));
  assert.ok(!src.includes('h.subjectIds.forEach(m=>{'));
});

test('studyTimeMaps guards subjectIds.filter', () => {
  assertReachable('studyTimeMaps-B0T_-AX0.js');
  const src = readAsset('studyTimeMaps-B0T_-AX0.js');
  assert.ok(src.includes('(t.subjectIds||[]).filter(a=>h.has(a))'));
  assert.ok(!src.includes('t.subjectIds.filter(a=>h.has(a))'));
});

test('ChapterHub guards question/resource topicIds reads', () => {
  assertReachable('ChapterHub-54e1WOv8.js');
  const src = readAsset('ChapterHub-54e1WOv8.js');
  assert.ok(src.includes('(n.topicIds||[]).length>0'), 'question topic count guarded');
  assert.ok(!src.includes('n.topicIds.length>0'), 'question topic count unguarded form gone');
  assert.ok(src.includes('(k.topicIds||[]).includes(o.id)'), 'question filter guarded');
  assert.ok(!src.includes('k.topicIds.includes(o.id)'), 'question filter unguarded form gone');
  assert.ok(src.includes('(v.topicIds||[]).includes(t??"")'), 'resource set guarded');
  assert.ok(!src.includes('v.topicIds.includes(t??"")'), 'resource set unguarded form gone');
  assert.ok(src.includes('(b.topicIds||[]).includes(t??"")'), 'question set guarded');
  assert.ok(!src.includes('b.topicIds.includes(t??"")'), 'question set unguarded form gone');
});
