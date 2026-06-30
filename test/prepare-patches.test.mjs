import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_REPO = path.resolve(ROOT, '../isotope-code');

function runPrepareWww() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isotope-www-'));
  const result = spawnSync(process.execPath, ['scripts/prepare-www.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      REPO_DIR: SOURCE_REPO,
      SOURCE_DIR: path.join(SOURCE_REPO, 'public'),
      WWW_DIR: tmp,
      BRIDGE_FILE: path.join(ROOT, 'android-bridge.js'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return tmp;
}

function runApplyPatches(wwwDir) {
  const result = spawnSync(process.execPath, ['scripts/apply-android-patches.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      WWW_DIR: wwwDir,
      ANDROID_DIR: path.join(ROOT, 'android-does-not-exist-for-unit-test'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('prepare-www patches restore-and-launch for legacy onboarding_completed fallback', () => {
  const wwwDir = runPrepareWww();
  const restore = fs.readFileSync(path.join(wwwDir, 'restore-and-launch.js'), 'utf8');
  const html = fs.readFileSync(path.join(wwwDir, 'index.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(wwwDir, 'android-bridge.js'), 'utf8');

  assert.match(restore, /typeof snapshot\.onboarding_completed === 'boolean'/);
  assert.match(restore, /onboarding: canonicalOnboarding/);
  assert.match(restore, /typeof completed === 'boolean' \? completed : undefined/);
  assert.match(restore, /dbResult !== null && typeof dbResult\.isOnboarded === 'boolean'/);
  assert.doesNotMatch(restore, /unknown state .+ onboarding/);
  assert.doesNotMatch(restore, /SYNC_FAILED[\s\S]{0,160}replaceState\(null, '', '\/dashboard'\)/);
  assert.doesNotMatch(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /apple-mobile-web-app-capable/);
  assert.doesNotMatch(html, /mobile-web-app-capable/);
  assert.match(bridge, /replacing with native Capacitor bridge/);
  assert.doesNotMatch(bridge, /skipping polyfill/);
});

test('apply-android-patches makes Auth login route exactly once from bootstrap and hydrates auth state', () => {
  const wwwDir = runPrepareWww();
  const output = runApplyPatches(wwwDir);
  assert.match(output, /Patched: Auth bundle/);
  assert.match(output, /Patched: App bundle PWA manager/);

  const authFile = fs.readdirSync(path.join(wwwDir, 'assets')).find((name) => /^Auth-.*\.js$/.test(name));
  assert.ok(authFile, 'Auth chunk should exist');
  const auth = fs.readFileSync(path.join(wwwDir, 'assets', authFile), 'utf8');

  assert.match(auth, /window\.__isoLogin/);
  assert.match(auth, /__r\.bootstrap && __r\.bootstrap\.onboarding/);
  assert.match(auth, /isAuthenticated: !0/);
  assert.match(auth, /window\.__ISO_BOOT_STATE__ = Object\.assign/);
  assert.match(auth, /readyDashboard/);
  assert.match(auth, /readyNeedsOnboarding/);
  assert.match(auth, /isotope:boot-state/);
  assert.match(auth, /isotope:native-auth-ready/);
  assert.match(auth, /Could not verify cloud onboarding state/);
  assert.equal((auth.match(/b\(__bootState === "readyDashboard" \? "\/dashboard" : "\/onboarding"/g) || []).length, 1);
  assert.equal(auth.includes('initializeAuth == "function" && await __state.initializeAuth()'), false);
  assert.equal(auth.includes('setTimeout(() => {\n                b("/dashboard"'), false);
});

test('apply-android-patches prevents stale logged-out boot state and preserves Android auth keys', () => {
  const wwwDir = runPrepareWww();
  const output = runApplyPatches(wwwDir);
  assert.match(output, /Patched: AppAccessGate bundle/);

  const assetsDir = path.join(wwwDir, 'assets');
  const accessGateFile = fs.readdirSync(assetsDir).find((name) => /^AppAccessGate-.*\.js$/.test(name));
  assert.ok(accessGateFile, 'AppAccessGate chunk should exist');
  const accessGate = fs.readFileSync(path.join(assetsDir, accessGateFile), 'utf8');

  assert.equal((accessGate.match(/Y === "readyLoggedOut" && !u/g) || []).length, 1);
  assert.equal((accessGate.match(/Y === "readyLoggedOut"\) return/g) || []).length, 0);

  const migrationSet = accessGate.match(/st = new Set\(\[[^\n]+\]\)/)?.[0] || '';
  assert.ok(migrationSet, 'local storage migration cleanup set should exist');
  assert.match(migrationSet, /"isotope-onboarding"/);
  assert.doesNotMatch(migrationSet, /"isotope-auth"/);
  assert.doesNotMatch(migrationSet, /"isotope-auth-token"/);
});

test('apply-android-patches lets Supabase auth storage read bridge-written sessions', () => {
  const wwwDir = runPrepareWww();
  runApplyPatches(wwwDir);

  const assetsDir = path.join(wwwDir, 'assets');
  const appFile = fs.readdirSync(assetsDir).find((name) => /^App-.*\.js$/.test(name) && fs.statSync(path.join(assetsDir, name)).size > 100_000);
  assert.ok(appFile, 'App chunk should exist');
  const app = fs.readFileSync(path.join(assetsDir, appFile), 'utf8');

  assert.match(app, /window\.__ISO_IS_ANDROID__ && window\.localStorage/);
  assert.match(app, /window\.localStorage\.getItem\(a\)/);
  assert.match(app, /sb-vteqquoqvksshmfhuepu-auth-token/);
  assert.match(app, /isotope-last-session-raw/);
  assert.match(app, /window\.localStorage\.setItem\(a, e\)/);
  assert.match(app, /window\.localStorage\.removeItem\(a\)/);
});

test('apply-android-patches disables PWA manager and uses native notification scheduling on Android', () => {
  const wwwDir = runPrepareWww();
  runApplyPatches(wwwDir);

  const assetsDir = path.join(wwwDir, 'assets');
  const appFile = fs.readdirSync(assetsDir).find((name) => /^App-.*\.js$/.test(name) && fs.statSync(path.join(assetsDir, name)).size > 100_000);
  const notificationFile = fs.readdirSync(assetsDir).find((name) => /^useNotificationStore-.*\.js$/.test(name));
  const focusStoreFile = fs.readdirSync(assetsDir).find((name) => /^useFocusStore-.*\.js$/.test(name));
  assert.ok(appFile, 'App chunk should exist');
  assert.ok(notificationFile, 'notification store chunk should exist');
  assert.ok(focusStoreFile, 'focus store chunk should exist');

  const app = fs.readFileSync(path.join(assetsDir, appFile), 'utf8');
  const notifications = fs.readFileSync(path.join(assetsDir, notificationFile), 'utf8');
  const focusStore = fs.readFileSync(path.join(assetsDir, focusStoreFile), 'utf8');

  assert.match(app, /__ISO_IS_ANDROID__ \? null : S\.jsx\(mn/);
  assert.match(notifications, /__isoScheduleNativeNotification/);
  assert.match(notifications, /__isoCancelNativeNotification/);
  assert.match(focusStore, /__isoScheduleFocusTimer/);
  assert.match(focusStore, /__isoCancelFocusTimer/);
});
