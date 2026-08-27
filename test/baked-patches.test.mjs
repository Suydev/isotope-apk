import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Guards the invariants that AGENTS.md previously asked agents to verify BY HAND
// after every upstream asset capture:
//
//   1. The baked patch anchors in www/assets/ (the APK cannot run server.mjs's
//      ~21 getPatched*Bundle() functions, so those patches are baked in — a
//      re-capture that overwrites a bundle silently drops them).
//   2. The two android-bridge copies stay identical.
//   3. The app version is not hardcoded in more than one place.
//
// A manual checklist is skipped exactly when it matters most, and a lost anchor
// is invisible until a device runtime bug. These are cheap file reads, so they
// run on every `npm test`.

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'www', 'assets');

function readAsset(name) {
  return fs.readFileSync(path.join(ASSETS, name), 'utf8');
}

// ── 1. Baked patch anchors (mirrors the AGENTS.md table) ────────────────────

const REQUIRED_ANCHORS = [
  ['useAuthStore-Aw1au7RF.js', 'if(a==="isotope-auth-token"){try{const l=localStorage.getItem',
    'session mirrored to plain localStorage — without it login does not persist'],
  ['useAuthStore-Aw1au7RF.js', 'autoRefreshToken:!0',
    'sessions auto-refresh — without it users are logged out hourly'],
  ['useAuthStore-Aw1au7RF.js', 'isPremium:()=>!0',
    'premium unlocked'],
  ['useAuthStore-Aw1au7RF.js', 'planType:"ranker"',
    'premium plan type'],
  ['communityApi-Ccw5N_9O.js', 'const s=()=>!1;',
    'demo gate off — without it Community shows fixtures instead of real RPCs'],
  ['communityApi-Ccw5N_9O.js', 'getGroupMessages',
    'group chat method present'],
  ['communityApi-Ccw5N_9O.js', 'getLeaderboard',
    'leaderboard method present'],
  ['communityApi-Ccw5N_9O.js', '/__leaderboard',
    'leaderboard routed at the bridge endpoint'],
  ['Community-CEnEgsrd.js', '(h.group.subjects||[])',
    'null-safety crash guard — without it Community black-screens'],
  ['Auth-D0Y8CB1f.js', '__isoLogin',
    'login routed through the bridge'],
  ['Auth-D0Y8CB1f.js', '__isoUp',
    'signup routed through the bridge'],
  ['sessionSync-mloIEnTd.js', 'remains pending',
    'sync failures queue instead of reporting fake success'],
  ['useInvites-D9RLFwf8.js', 'p_code',
    'invite RPC param name matches the deployed function'],
];

// Anchors that must NOT be present.
const FORBIDDEN_ANCHORS = [
  ['index-D1Y5F8Lk.js', 'ingest.us.sentry.io',
    'Sentry must stay disabled in the APK'],
  ['Focus-B4gLsWoP.js', 'window.__pipBridge=',
    'the dead HTTP PiP relay must stay stripped (native PiP is used instead)'],
];

for (const [file, anchor, meaning] of REQUIRED_ANCHORS) {
  test(`baked patch survives: ${file} — ${meaning}`, () => {
    assert.ok(
      readAsset(file).includes(anchor),
      `Lost baked patch in www/assets/${file}.\n` +
      `  Missing anchor: ${anchor}\n` +
      `  Meaning: ${meaning}\n` +
      `  This usually means an upstream capture overwrote the bundle. ` +
      `Restore it from git and re-apply, see AGENTS.md "Patch anchor checklist".`,
    );
  });
}

for (const [file, anchor, meaning] of FORBIDDEN_ANCHORS) {
  test(`stripped code stays stripped: ${file} — ${meaning}`, () => {
    assert.ok(
      !readAsset(file).includes(anchor),
      `www/assets/${file} contains code that must be stripped: ${anchor}\n` +
      `  Reason: ${meaning}`,
    );
  });
}

test('no www/assets bundle contains the upstream FILE IDENTITY placeholder', () => {
  // Upstream ships one garbage placeholder (analyticsWorker) that has broken the
  // APK before; AGENTS.md documents grepping for it after every capture.
  const offenders = fs.readdirSync(ASSETS)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => readAsset(name).includes('FILE IDENTITY'));
  assert.deepEqual(offenders, [],
    `Placeholder bundles captured from upstream: ${offenders.join(', ')}. ` +
    'Restore them from git.');
});

// ── 2. Bridge copy parity ───────────────────────────────────────────────────

for (const name of ['android-bridge.js', 'android-floating-timer-bridge.js']) {
  test(`${name} root copy matches the www/ copy`, () => {
    const root = fs.readFileSync(path.join(ROOT, name), 'utf8');
    const www = fs.readFileSync(path.join(ROOT, 'www', name), 'utf8');
    assert.equal(root, www,
      `${name} differs between the repo root and www/.\n` +
      '  The ROOT copy is the source of truth (scripts/prepare-www.js copies ' +
      'root -> www/). Edit the root file, then run `npm run prepare-www` or ' +
      'copy it into www/ before committing.');
  });
}

// ── 3. Version single-source-of-truth ───────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('bridge APP_VERSION matches package.json', () => {
  const bridge = fs.readFileSync(path.join(ROOT, 'android-bridge.js'), 'utf8');
  const match = bridge.match(/var APP_VERSION\s*=\s*'([^']+)'/);
  assert.ok(match, 'android-bridge.js must declare var APP_VERSION');
  assert.equal(match[1], pkg.version,
    'android-bridge.js APP_VERSION is stale — bump package.json and run ' +
    '`npm run prepare-www` (it rewrites this).');
});

test('index.html __ISO_APP_VERSION__ matches package.json', () => {
  const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
  const match = html.match(/window\.__ISO_APP_VERSION__\s*=\s*'([^']+)'/);
  assert.ok(match, 'www/index.html must set window.__ISO_APP_VERSION__');
  assert.equal(match[1], pkg.version,
    'www/index.html version is stale — this drifted to 3.4.6 while ' +
    'package.json said 3.5.3 because prepare-www.js only injected the global ' +
    'when absent instead of rewriting it.');
});

test('capacitor appendUserAgent matches package.json', () => {
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  const ua = cap.android && cap.android.appendUserAgent;
  assert.ok(ua, 'capacitor.config.json must set android.appendUserAgent');
  assert.equal(ua, `IsotopeAI-Android/${pkg.version}`,
    'capacitor.config.json appendUserAgent is stale relative to package.json.');
});

test('build.gradle derives the version from package.json rather than pinning it', () => {
  const gradle = fs.readFileSync(
    path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  assert.match(gradle, /packageJson\.version/,
    'build.gradle must read the version from package.json so a single bump ' +
    'propagates to versionName/versionCode.');
});

test('no stray app-config.json reintroduces a second version source', () => {
  // Deleted 2026-08-27: it duplicated supabase.config.json, was read by nothing,
  // and its stale "version" field was one of five disagreeing version strings.
  assert.equal(fs.existsSync(path.join(ROOT, 'app-config.json')), false,
    'app-config.json is deleted on purpose — use supabase.config.json for ' +
    'Supabase settings and package.json for the version.');
});

// ── 4. Migration layout ─────────────────────────────────────────────────────

test('SQL migrations live only under supabase/', () => {
  const strays = fs.readdirSync(ROOT)
    .filter((name) => /^\d{3}[a-z]?_.*\.sql$/.test(name));
  assert.deepEqual(strays, [],
    `Numbered migrations found at the repo root: ${strays.join(', ')}. ` +
    'They belong in supabase/ — root copies previously drifted from the real ones.');
});
