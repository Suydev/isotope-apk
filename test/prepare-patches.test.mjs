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

test('apply-android-patches wires Android online status, Floating Timer, emoji repair, and font scale controls', () => {
  const wwwDir = runPrepareWww();
  const output = runApplyPatches(wwwDir);

  assert.match(output, /Patching online status hook/);
  assert.match(output, /Patching useSyncStore bundle/);
  assert.match(output, /Patching Focus bundle for Android Floating Timer/);
  assert.match(output, /Patching Settings bundle/);

  const assetsDir = path.join(wwwDir, 'assets');
  const onlineFile = fs.readdirSync(assetsDir).find((name) => /^useOnlineStatus-.*\.js$/.test(name));
  const syncStoreFile = fs.readdirSync(assetsDir).find((name) => /^useSyncStore-.*\.js$/.test(name));
  const appFile = fs.readdirSync(assetsDir).find((name) => /^App-.*\.js$/.test(name) && fs.statSync(path.join(assetsDir, name)).size > 100_000);
  const focusFile = fs.readdirSync(assetsDir).find((name) => /^Focus-.*\.js$/.test(name));
  const settingsFile = fs.readdirSync(assetsDir).find((name) => /^SettingsLayout-.*\.js$/.test(name));
  assert.ok(onlineFile, 'online status chunk should exist');
  assert.ok(syncStoreFile, 'sync store chunk should exist');
  assert.ok(appFile, 'App chunk should exist');
  assert.ok(focusFile, 'Focus chunk should exist');
  assert.ok(settingsFile, 'Settings chunk should exist');

  const online = fs.readFileSync(path.join(assetsDir, onlineFile), 'utf8');
  const syncStore = fs.readFileSync(path.join(assetsDir, syncStoreFile), 'utf8');
  const app = fs.readFileSync(path.join(assetsDir, appFile), 'utf8');
  const focus = fs.readFileSync(path.join(assetsDir, focusFile), 'utf8');
  const settings = fs.readFileSync(path.join(assetsDir, settingsFile), 'utf8');

  assert.match(online, /__isoIsOnline/);
  assert.match(online, /isotope:network/);
  assert.doesNotMatch(online, /useState\(navigator\.onLine\)/);
  assert.match(syncStore, /__isoRunManualCloudSync/);
  assert.match(syncStore, /__isoDownloadAndImportBackup/);
  assert.match(syncStore, /__isoGetValidJwt/);
  assert.match(syncStore, /header_manual_sync/);
  assert.match(syncStore, /header_download_cloud_data/);
  assert.doesNotMatch(syncStore, /if \(!s \|\| !r \|\| !a\) return;\s+const o = await n\(\);\s+await o\.fullManualSync/);
  assert.doesNotMatch(syncStore, /if \(!s \|\| !r \|\| !a\) return;\s+const o = await n\(\);\s+await o\.downloadCloudSnapshot/);
  assert.match(app, /__isoNormalizeFocusIcon/);
  assert.match(focus, /__isoOpenFloatingTimer/);
  assert.match(focus, /getState: \(\) =>/);
  assert.match(focus, /dispatch: __action =>/);
  assert.match(focus, /showQuestionControls: rt/);
  assert.match(focus, /Floating Timer could not be opened/);
  assert.doesNotMatch(focus, /__isoEnterFocusPip/);
  assert.match(settings, /children: "Font Size"/);
  assert.match(settings, /fontScale: P/);
  assert.match(settings, /isotope-font-scale/);
});

test('apply-android-patches adds Android analytics render stability and app-only links', () => {
  const wwwDir = runPrepareWww();
  runApplyPatches(wwwDir);

  const assetsDir = path.join(wwwDir, 'assets');
  const indexFile = fs.readdirSync(assetsDir).find((name) => /^index-.*\.js$/.test(name) && fs.readFileSync(path.join(assetsDir, name), 'utf8').includes('vendor-sentry-VzeXdCeF.js'));
  const analyticsFile = fs.readdirSync(assetsDir).find((name) => /^Analytics-.*\.js$/.test(name));
  const analyticsPeriodFile = fs.readdirSync(assetsDir).find((name) => /^AnalyticsPeriod-.*\.js$/.test(name));
  const sessionLogFile = fs.readdirSync(assetsDir).find((name) => /^SessionLogTable-.*\.js$/.test(name));
  const dashboardHeaderFile = fs.readdirSync(assetsDir).find((name) => /^DashboardHeader-.*\.js$/.test(name));
  const headwayFile = fs.readdirSync(assetsDir).find((name) => /^HeadwayUpdatesButton-.*\.js$/.test(name));
  assert.ok(indexFile, 'index chunk should exist');
  assert.ok(analyticsFile, 'Analytics chunk should exist');
  assert.ok(analyticsPeriodFile, 'AnalyticsPeriod chunk should exist');
  assert.ok(sessionLogFile, 'SessionLogTable chunk should exist');
  assert.ok(dashboardHeaderFile, 'DashboardHeader chunk should exist');
  assert.ok(headwayFile, 'Headway chunk should exist');

  const index = fs.readFileSync(path.join(assetsDir, indexFile), 'utf8');
  const analytics = fs.readFileSync(path.join(assetsDir, analyticsFile), 'utf8');
  const analyticsPeriod = fs.readFileSync(path.join(assetsDir, analyticsPeriodFile), 'utf8');
  const sessionLog = fs.readFileSync(path.join(assetsDir, sessionLogFile), 'utf8');
  const dashboardHeader = fs.readFileSync(path.join(assetsDir, dashboardHeaderFile), 'utf8');
  const headway = fs.readFileSync(path.join(assetsDir, headwayFile), 'utf8');

  assert.match(index, /__ISO_IS_ANDROID__\) return !1/);
  assert.match(analytics, /__androidStable/);
  assert.match(analytics, /Math\.min\(0,x\+1\)/);
  assert.match(analyticsPeriod, /__ISO_IS_ANDROID__\?!1:ie\(\)/);
  assert.match(sessionLog, /h\.slice\(0,120\)/);
  assert.match(sessionLog, /layout:typeof window<"u"&&window\.__ISO_IS_ANDROID__\?!1:!0/);
  assert.match(dashboardHeader, /https:\/\/isotopeaiapp\.featurebase\.app\//);
  assert.match(dashboardHeader, /max-h-\[calc\(100dvh-12rem\)\]/);
  assert.doesNotMatch(dashboardHeader, /https:\/\/isotope\.featurebase\.app/);
  assert.match(headway, /account: "7eeYY7"/);
  assert.match(headway, /__ISO_IS_ANDROID__ \? null : a\.persistentStorageGranted/);
  assert.doesNotMatch(headway, /account: "JRVAXJ"/);
});

test('Android native project exposes notification icon, launcher logo, Floating Timer, and keyboard contracts', () => {
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const activity = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/in/isotopeai/app/MainActivity.java'), 'utf8');
  const service = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/in/isotopeai/app/FloatingTimerService.java'), 'utf8');
  const notificationIcon = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable/ic_notification.xml'), 'utf8');
  const launcherForeground = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml'), 'utf8');
  const launcherBackground = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/ic_launcher_background.xml'), 'utf8');
  const capacitorConfig = fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/styles.xml'), 'utf8');

  assert.match(manifest, /android:resizeableActivity="true"/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(manifest, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.match(manifest, /android:name="\.FloatingTimerService"/);
  assert.match(activity, /addJavascriptInterface\(new IsotopeAndroidInterface\(\), "IsotopeAndroid"\)/);
  assert.match(activity, /startFloatingTimer/);
  assert.match(activity, /requestOverlayPermission/);
  assert.match(activity, /replayFloatingTimerActions/);
  assert.match(activity, /public void onStart\(\)/);
  assert.match(activity, /public void onResume\(\)/);
  assert.match(activity, /webView\.resumeTimers\(\)/);
  assert.match(activity, /__isoAndroidForceRepaint/);
  assert.doesNotMatch(activity, /protected void onStart\(\)/);
  assert.match(service, /TYPE_APPLICATION_OVERLAY/);
  assert.match(service, /startForeground/);
  assert.match(notificationIcon, /strokeColor="#FFFFFFFF"/);
  assert.match(launcherForeground, /A78BFA/);
  assert.match(launcherBackground, /#111827/);
  assert.match(styles, /postSplashScreenTheme/);
  assert.match(styles, /android:windowBackground">#09090B/);
  assert.match(capacitorConfig, /"smallIcon": "ic_notification"/);
  assert.doesNotMatch(capacitorConfig, /"sound": "beep"/);
});
