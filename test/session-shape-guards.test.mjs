import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'www', 'assets');

function readAsset(name) {
  return fs.readFileSync(path.join(ASSETS, name), 'utf8');
}

// Regression: "Cannot read properties of undefined (reading 'includes')" on the
// Dashboard (Dashboard-Dzf-IC_a.js) when a cloud-synced study_sessions_log row
// reaches the UI without a subjectIds array. The same data shape crashes the
// Analytics / study-time views, so every unguarded live read is pinned here.
//
// Most bundles already guard with `s.subjectIds && s.subjectIds...`; these four
// were the exceptions. A future re-capture that reverts the guards fails loudly.

test('Dashboard guards subjectIds.includes on completed sessions', () => {
  const src = readAsset('Dashboard-Dzf-IC_a.js');
  assert.ok(
    src.includes('(S.subjectIds||[]).includes(s.id)'),
    'Dashboard crash fix missing (reading "includes")',
  );
  assert.ok(
    !src.includes('S.subjectIds.includes(s.id)'),
    'unguarded S.subjectIds.includes still present in Dashboard',
  );
});

test('Dashboard guards subjectIds.length when building subject ids', () => {
  const src = readAsset('Dashboard-Dzf-IC_a.js');
  assert.ok(src.includes('(o.subjectIds||[]).length>0?o.subjectIds:'));
  assert.ok(!src.includes('o.subjectIds.length>0?o.subjectIds:'));
});

test('AnalyticsToday guards subjectIds.forEach', () => {
  const src = readAsset('AnalyticsToday-BTv1jnKt.js');
  assert.ok(src.includes('(h.subjectIds||[]).forEach(m=>{'));
  assert.ok(!src.includes('h.subjectIds.forEach(m=>{'));
});

test('studyTimeMaps guards subjectIds.filter', () => {
  const src = readAsset('studyTimeMaps-B0T_-AX0.js');
  assert.ok(src.includes('(t.subjectIds||[]).filter(a=>h.has(a))'));
  assert.ok(!src.includes('t.subjectIds.filter(a=>h.has(a))'));
});
