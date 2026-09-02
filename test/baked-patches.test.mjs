import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveGraph, findReachableContaining } from '../scripts/www-graph.mjs';

// Guards the invariants that AGENTS.md previously asked agents to verify BY HAND
// after every upstream asset capture:
//
//   1. The baked patch anchors in www/assets/ (the APK cannot run server.mjs's
//      ~21 getPatched*Bundle() functions, so those patches are baked in — a
//      re-capture that overwrites a bundle silently drops them).
//   2. Those anchors live in bundles the app can actually LOAD (see the note on
//      REQUIRED_ANCHORS — two were being checked in orphaned files).
//   3. The two android-bridge copies stay identical.
//   4. The app version is not hardcoded in more than one place.
//
// A manual checklist is skipped exactly when it matters most, and a lost anchor
// is invisible until a device runtime bug. These are cheap file reads, so they
// run on every `npm test`.

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'www', 'assets');
const GRAPH = resolveGraph();

function readAsset(name) {
  return fs.readFileSync(path.join(ASSETS, name), 'utf8');
}

// ── 1. Baked patch anchors (mirrors the AGENTS.md table) ────────────────────
//
// Every entry is additionally asserted to live in a bundle the app can actually
// LOAD. www/assets holds 40 orphaned bundles (3.3 MB) left over from older
// builds — same module names, different content hashes — and two anchors from
// the AGENTS.md checklist were being "verified" in orphaned files:
//   sessionSync-mloIEnTd.js  ('remains pending')
//   useInvites-D9RLFwf8.js   ('p_code')
// Those checks passed while proving nothing about the running app. Reachability
// is resolved from index.html's entry script through the real import graph
// (scripts/www-graph.mjs).

const REQUIRED_ANCHORS = [
  ['useAuthStore-Aw1au7RF.js', 'if(a==="isotope-auth-token"){try{const l=localStorage.getItem',
    'session mirrored to plain localStorage — without it login does not persist'],
  ['useAuthStore-Aw1au7RF.js', 'autoRefreshToken:!0',
    'sessions auto-refresh — without it users are logged out hourly'],
  ['useAuthStore-Aw1au7RF.js', 'isPremium:()=>!0',
    'premium unlocked'],
  ['useAuthStore-Aw1au7RF.js', 'planType:"ranker"',
    'premium plan type'],
  ['useAuthStore-Aw1au7RF.js', '__isoOAuthPatched',
    'signInWithOAuth honours the caller redirectTo + hands off to the native browser'],
  ['communityApi-Ccw5N_9O.js', 'const s=()=>!1;',
    'demo gate off — without it Community shows fixtures instead of real RPCs'],
  ['communityApi-Ccw5N_9O.js', 'getGroupMessages',
    'group chat method present'],
  ['communityApi-Ccw5N_9O.js', 'getLeaderboard',
    'leaderboard method present'],
  ['communityApi-Ccw5N_9O.js', '/__leaderboard',
    'leaderboard routed at the bridge endpoint'],
  // The live invite path is communityApi -> community_{preview,redeem}_invite
  // with p_token. The p_code/accept_invite pair the bridge also handles is only
  // reached from the ORPHANED useInvites bundle, so pin the param name that the
  // shipped code actually sends — both RPCs exist on the project.
  ['communityApi-Ccw5N_9O.js', 'community_preview_invite',
    'invite preview RPC — the live invite path'],
  ['communityApi-Ccw5N_9O.js', 'community_redeem_invite',
    'invite redeem RPC — the live invite path'],
  ['communityApi-Ccw5N_9O.js', 'p_token',
    'invite RPCs send p_token (NOT p_code — that is the orphaned useInvites path)'],
  ['Community-CEnEgsrd.js', '(h.group.subjects||[])',
    'null-safety crash guard — without it Community black-screens'],
  // A buddy row with no presence record is a real state, and this bundle
  // dereferences presence.state / .subject / .task at 22 sites. Unguarded, the
  // first such buddy throws inside render and unmounts the tree — a black screen
  // on the Community tab with no recovery prompt. See ISSUE-047.
  ['Community-CEnEgsrd.js', 'presence?.state',
    'presence is optional-chained — a buddy with no presence row must not crash render'],
  ['Community-CEnEgsrd.js', 'presence?.state||"hidden"',
    'an absent presence state renders as "Status not shared", not a blank pill'],
  // Ambient audio must be LOCAL. Upstream fetches three WAVs from
  // raw.githubusercontent.com, which is 44 MB over the network and simply fails
  // offline — on a study app whose premise is that it works without a connection.
  // The APK bakes what isotope-code's server.mjs patches at serve time.
  ['Focus-B4gLsWoP.js', '/audio/ambient/',
    'ambient tracks are served from the bundled files, not fetched from GitHub'],
  ['Focus-B4gLsWoP.js', 'window.__isoAmbient(c.url)',
    'the Audio constructor goes through the Opus/AAC picker — Safari has no Ogg-Opus'],
  ['Auth-D0Y8CB1f.js', '__isoLogin',
    'login routed through the bridge'],
  ['Auth-D0Y8CB1f.js', '__isoUp',
    'signup routed through the bridge'],
];

// Anchors that must NOT be present.
const FORBIDDEN_ANCHORS = [
  ['index-D1Y5F8Lk.js', 'ingest.us.sentry.io',
    'Sentry must stay disabled in the APK'],
  // The inverse of the guard above: a re-capture from upstream would reintroduce
  // the raw dereference, and the guard's presence elsewhere in the file would not
  // reveal it. Pin the unguarded form as forbidden.
  ['Community-CEnEgsrd.js', '.presence.state',
    'raw presence.state dereference — must stay optional-chained (ISSUE-047)'],
  ['Focus-B4gLsWoP.js', 'raw.githubusercontent.com',
    'no remote audio fetch — the APK must not depend on GitHub being reachable'],
  ['Focus-B4gLsWoP.js', 'window.__pipBridge=',
    'the dead HTTP PiP relay must stay stripped (native PiP is used instead)'],
];

for (const [file, anchor, meaning] of REQUIRED_ANCHORS) {
  test(`baked patch survives: ${file} — ${meaning}`, () => {
    // Reachability first: an anchor in an orphaned bundle is a false assurance,
    // so failing loudly here is the point.
    assert.ok(
      GRAPH.reachable.has(file),
      `www/assets/${file} is NOT reachable from index.html's entry script, so ` +
      'asserting an anchor in it proves nothing about the shipped app.\n' +
      '  Find where the live code is:  node scripts/www-graph.mjs\n' +
      `  Or search the live graph for the anchor and re-point this entry.`,
    );
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
      GRAPH.reachable.has(file),
      `www/assets/${file} is not reachable — this assertion is vacuous.`,
    );
    assert.ok(
      !readAsset(file).includes(anchor),
      `www/assets/${file} contains code that must be stripped: ${anchor}\n` +
      `  Reason: ${meaning}`,
    );
  });
}

// ── 1b. Live-path contracts ─────────────────────────────────────────────────
// These pin behaviour by SEARCHING the reachable graph rather than naming a
// bundle, so they survive a content-hash change without silently going vacuous.

test('the live invite path exists and uses p_token', () => {
  const owner = findReachableContaining('community_redeem_invite');
  assert.ok(owner, 'no reachable bundle calls community_redeem_invite — invites cannot work');
  assert.ok(
    readAsset(owner).includes('p_token'),
    `${owner} calls community_redeem_invite but not with p_token. Both p_token ` +
    '(community_*_invite) and p_code (accept_invite) RPCs exist on the project, ' +
    'so sending the wrong one fails at runtime, not at build time.',
  );
});

test('a reachable bundle drives the community RPC layer', () => {
  const owner = findReachableContaining('community_get_overview');
  assert.ok(owner, 'no reachable bundle calls community_get_overview — Community is dead');
});

test('the demo/fixture gate is off in the reachable community API', () => {
  const owner = findReachableContaining('community_get_overview');
  assert.ok(
    readAsset(owner).includes('const s=()=>!1;'),
    `${owner} still has the demo gate enabled — Community would render fixtures ` +
    'instead of real data.',
  );
});

test('every www/assets bundle referenced by the app exists', () => {
  assert.deepEqual(GRAPH.missing, [],
    `Broken imports — referenced but absent: ${GRAPH.missing.join(', ')}`);
});

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
