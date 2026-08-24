import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WWW  = path.join(ROOT, 'www');
const BRIDGE = path.join(ROOT, 'android-bridge.js');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

test('prepared www/index.html must NOT reference server-only script tags', () => {
  const html = read(path.join(WWW, 'index.html'));
  // deferred-scripts.js is served by server.mjs only — absent in the standalone APK build
  assert.ok(!html.includes('/deferred-scripts.js'), 'index.html still references /deferred-scripts.js (server-only, must be stripped)');
  // pwa-local.js is disabled in the APK (potato-mode / sw persist handled by bridge)
  assert.ok(!html.includes('/pwa-local.js'),        'index.html still references /pwa-local.js');
  assert.ok(!html.includes('/update-checker.js'),   'index.html still references /update-checker.js');
});

test('bridge script loads BEFORE restore-and-launch module in index.html', () => {
  const html = read(path.join(WWW, 'index.html'));
  const bridgeIdx  = html.indexOf('/android-bridge.js');
  const launchIdx  = html.indexOf('/restore-and-launch.js');
  assert.ok(bridgeIdx >= 0,  'missing /android-bridge.js in index.html');
  assert.ok(launchIdx >= 0,  'missing /restore-and-launch.js in index.html');
  assert.ok(bridgeIdx < launchIdx, 'android-bridge.js must load before restore-and-launch.js (restores __ISO_SUPA_URL__ before boot)');
});

test('android-bridge.js exposes the runtime contract the app depends on', () => {
  const bridge = read(BRIDGE);
  assert.ok(bridge.includes('window.__ISO_SUPA_URL__'),    'bridge must set window.__ISO_SUPA_URL__');
  assert.ok(bridge.includes('window.__ISO_ANON__'),        'bridge must set window.__ISO_ANON__');
  assert.ok(bridge.includes('window.__ISO_IS_ANDROID__'),  'bridge must flag Android runtime');
  // login must be handled by the bridge (not by a fetch to a local server)
  assert.ok(/window\.__isoLogin\s*=/.test(bridge),         'bridge must provide window.__isoLogin');
});

test('the bridge targets the prod Supabase project (no localhost/server dependency)', () => {
  const bridge = read(BRIDGE);
  // SUPA_URL and anon key must be real prod values, not a local server
  assert.ok(/\.supabase\.co['"]/.test(bridge),  'bridge SUPA_URL should point at *.supabase.co, not localhost');
  // Allow loopback for in-app PiP (native overlay) and OAuth — these are intentional loopback, not a dev server dependency
  // Strip all loopback references (pip, OAuth, isLoopback checks, and comments) before testing for dev-server dependency
  let stripped = bridge;
  stripped = stripped.replace(/https?:\/\/(127\.0\.0\.1|localhost):3000\/__pip[^\s"']*/g, '');
  stripped = stripped.replace(/https?:\/\/(127\.0\.0\.1|localhost):3000\/api\/pip[^\s"']*/g, '');
  stripped = stripped.replace(/https?:\/\/(127\.0\.0\.1|localhost):3000\/__supa[^\s"']*/g, '');
  stripped = stripped.replace(/https?:\/\/(127\.0\.0\.1|localhost):6767[^\s"']*/g, '');
  stripped = stripped.replace(/url\.indexOf\(['"]127\.0\.0\.1:3000['"]\)/g, '');
  stripped = stripped.replace(/url\.indexOf\(['"]localhost:3000['"]\)/g, '');
  stripped = stripped.replace(/url\.indexOf\(['"]127\.0\.0\.1:6767['"]\)/g, '');
  stripped = stripped.replace(/\/\/.*localhost:3000.*/g, '');
  // Check for actual fetch/XHR to localhost:3000, not just string checks or comments
  assert.ok(!/localhost:3000/.test(stripped),     'bridge must not reference localhost:3000 except for pip loopback');
});

test('bundled JS has no runtime dependency on a local dev server', () => {
  const bundles = fs.readdirSync(path.join(WWW, 'assets')).filter((f) => f.endsWith('.js'));
  assert.ok(bundles.length > 50, `expected a full www build (~129 bundles), found ${bundles.length}`);
  const devServer = 'localhost:3000'; // the dev-server port — must never be a real fetch target in the APK
  let offenders = [];
  for (const b of bundles) {
    let src = read(path.join(WWW, 'assets', b));
    // Sentry's tracePropagationTargets allow-lists "localhost" and references
    // yourserver.io — that is telemetry config, NOT a fetch. Strip that block
    // before inspecting the rest of the bundle for real network targets.
    src = src.replace(/tracePropagationTargets\s*:\s*\[[\s\S]*?\](?:,\s*)?/g, '[]');
    // supabase-js ships a default fallback host string ("http://localhost:9999");
    // it is overridden at runtime by the bridge's SUPA_URL and is never fetched.
    src = src.replace(/"http:\/\/localhost:9999"/g, '""');
    if (src.includes(devServer)) offenders.push(b);
  }
  assert.equal(offenders.length, 0, `bundles target the local dev server (black-screen risk): ${offenders.join(', ')}`);
});
