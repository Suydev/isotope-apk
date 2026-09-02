/**
 * test/android-layout-parity.test.mjs
 *
 * Verifies that android-bridge.js and FloatingTimerService.java contain the
 * required layout/safety fixes documented in the IsotopeAI Android tablet UI
 * hardening spec.
 *
 * These tests check behaviour (markers that prove the fix is present),
 * NOT exact whitespace or minified class ordering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const bridge  = fs.readFileSync(path.join(ROOT, 'android-bridge.js'), 'utf8');
const service = fs.readFileSync(
  path.join(ROOT, 'android/app/src/main/java/in/isotopeai/app/FloatingTimerService.java'),
  'utf8',
);

// ── android-bridge.js checks ─────────────────────────────────────────────────

test('android-bridge injects global error capture (window.onerror)', () => {
  assert.match(bridge, /window\.__ISO_LAST_RUNTIME_ERROR__/);
  assert.match(bridge, /IsotopeAndroidRuntime/);
  assert.match(bridge, /window\.onerror\s*=/);
});

test('android-bridge injects unhandledrejection capture', () => {
  assert.match(bridge, /window\.onunhandledrejection\s*=/);
  assert.match(bridge, /Unhandled (promise )?rejection/i);
});

test('android-bridge adds iso-android CSS class to html element', () => {
  assert.match(bridge, /classList\.add\(['"](iso-android)['"]\)/);
});

test('android-bridge injects tablet layout CSS style element', () => {
  assert.match(bridge, /__iso_android_layout_css/);
  // Notification dropdown clamp must be present
  assert.match(bridge, /notification/i);
  assert.match(bridge, /max-height/);
  // Touch target min size
  assert.match(bridge, /44px/);
});

test('android-bridge does not globally shrink the entire app', () => {
  // Must not set font-size or zoom on html/body globally
  assert.doesNotMatch(bridge, /html\.iso-android\s*\{[^}]*font-size:\s*(?!1[0-9][0-9])/);
  assert.doesNotMatch(bridge, /body\s*\{\s*zoom:/);
});

// ── FloatingTimerService.java checks ────────────────────────────────────────

test('FloatingTimerService uses landscape-aware overlay width clamping', () => {
  // Must check orientation and limit landscape width to ~36% of screen
  assert.match(service, /ORIENTATION_LANDSCAPE/);
  assert.match(service, /0\.36f/);
});

test('FloatingTimerService caps overlay height at 70% of screen', () => {
  assert.match(service, /0\.70f/);
});

test('FloatingTimerService default overlay size is compact (≤300dp wide)', () => {
  // Default width must be ≤ 300dp so it doesn't cover screen center by default
  assert.match(service, /PREF_WIDTH,\s*dp\((?:240|260|280|300)\)\)/);
});

test('FloatingTimerService brand color is violet-500 not orange', () => {
  // Brand color must be violet (139, 92, 246) — NOT orange (249, 115, 22)
  assert.match(service, /BRAND_500.*Color\.rgb\(139\s*,\s*92\s*,\s*246\)/s);
  assert.doesNotMatch(service, /BRAND_500.*Color\.rgb\(249\s*,\s*115\s*,\s*22\)/s);
});

test('FloatingTimerService has pomodoro cycle display field', () => {
  assert.match(service, /pomodoroCycle/);
  assert.match(service, /pomodoroSessionsUntilLongBreak/);
});

test('FloatingTimerService shows progress strip fill view', () => {
  assert.match(service, /progressFill/);
  assert.match(service, /setScaleX/);
  assert.match(service, /setPivotX\(0/);
});

test('FloatingTimerService uses rounded-2xl style buttons (16dp radius)', () => {
  assert.match(service, /setCornerRadius\(dp\(16\)\)/);
});

// ── Overlay PiP: control completeness + accessibility (ISSUE-038) ────────────
// The overlay is the app's real PiP (native views, tappable), so it must carry
// every control from the 17-element contract in isotope-code/pipapk.md.

test('overlay has a pause/resume control wired to togglePause', () => {
  // MainActivity.isAllowedFloatingTimerAction and the JS bridge have always
  // accepted pause/resume/togglePause, and the notification even reads
  // "paused — tap to resume" — but no control emitted them, so a paused session
  // could not be resumed from the overlay.
  assert.match(service, /dispatchAction\("togglePause"/,
    'overlay must dispatch togglePause');
  assert.match(service, /pauseButton/,
    'overlay must have a pause button field');
  // Label has to follow state, not be a static "Pause"
  assert.match(service, /pauseButton\.setText\(\s*isPaused\s*\?\s*"Resume"\s*:\s*"Pause"\s*\)/,
    'pause button label must reflect paused state');
});

test('overlay renders the question-section separator (element #6)', () => {
  assert.match(service, /questionSeparator/,
    'the only element of the PiP contract the overlay lacked');
});

test('overlay content is scrollable so no control is clipped', () => {
  // Full control stack is ~405dp but the card is resizable down to 200dp and
  // LinearLayout silently clips overflow — Undo was unreachable at small sizes.
  assert.match(service, /import android\.widget\.ScrollView;/);
  assert.match(service, /new ScrollView\(this\)/);
});

test('drag is bound to the header, not the whole card', () => {
  // handleDragTouch consumes ACTION_MOVE, so binding it to the card would make
  // the new ScrollView unscrollable.
  assert.match(service, /header\.setOnTouchListener\(this::handleDragTouch\)/);
  assert.doesNotMatch(service, /cardView\.setOnTouchListener\(this::handleDragTouch\)/);
});

test('glyph-only overlay buttons carry spoken labels', () => {
  // "↗" and "×" announce as raw glyphs to TalkBack without these.
  assert.match(service, /expandButton\.setContentDescription\(/);
  assert.match(service, /closeButton\.setContentDescription\(/);
  assert.match(service, /correctButton\.setContentDescription\(/);
  assert.match(service, /incorrectButton\.setContentDescription\(/);
  assert.match(service, /skippedButton\.setContentDescription\(/);
});

test('small header buttons get an expanded touch target', () => {
  // Drawn at 36x28dp — below the 48dp Material minimum, 4dp apart, and one of
  // them is destructive.
  assert.match(service, /TouchDelegate/);
  assert.match(service, /expandTouchTarget\(button, dp\(48\)\)/);
});

test('counter button fills meet WCAG AA against their white labels', () => {
  // emerald-600 (3.77:1) and amber-600 (3.19:1) failed 4.5:1 for 13sp text.
  // emerald-700 = 5.48:1, amber-700 = 5.02:1, rose-600 = 4.70:1 (already passed).
  assert.match(service, /EMERALD_600\s*=\s*Color\.rgb\(\s*4\s*,\s*120\s*,\s*87\s*\)/,
    'correct button must use emerald-700');
  assert.match(service, /AMBER_600\s*=\s*Color\.rgb\(\s*180\s*,\s*83\s*,\s*9\s*\)/,
    'skip button must use amber-700');
  assert.match(service, /ROSE_600\s*=\s*Color\.rgb\(\s*225\s*,\s*29\s*,\s*72\s*\)/,
    'incorrect button keeps rose-600, which already passes');
});

test('status is conveyed by text as well as dot colour', () => {
  // Colour alone must not carry meaning.
  assert.match(service, /statusText\.setText\(state\.statusLabel\(\)\)/);
  assert.match(service, /"Focusing"/);
  assert.match(service, /"Paused"/);
});

// ── Regression tests for the 2026-08-31 native bug hunt ─────────────────────
//
// Each of these pins a fix whose absence is silent: the code compiles, the app
// runs, and the defect only appears in a specific state the emulator rarely
// reaches. They read source markers rather than running Java, which is the same
// approach as the tests above — there is no JVM in this environment.

const mainActivity = fs.readFileSync(
  path.join(ROOT, 'android/app/src/main/java/in/isotopeai/app/MainActivity.java'),
  'utf8',
);
const httpServer = fs.readFileSync(
  path.join(ROOT, 'android/app/src/main/java/in/isotopeai/app/PipHttpServer.java'),
  'utf8',
);

/**
 * Source with comments removed, for "this must not come back" assertions.
 *
 * A forbidden-pattern check has to read CODE, not prose. Several fixes below are
 * documented by quoting the defective line they replaced — so a naive
 * doesNotMatch against the raw file matches its own explanation and fails on
 * correct code. Stripping comments is the difference between a check that pins
 * behaviour and one that forbids describing history.
 */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const serviceCode = codeOnly(service);
const mainActivityCode = codeOnly(mainActivity);
const httpServerCode = codeOnly(httpServer);

test('overlay drag clamps BOTH axes so it cannot be lost off-screen', () => {
  // Was: layoutParams.x = windowStartX + dx  (no clamp), and FLAG_LAYOUT_NO_LIMITS
  // means the window manager does not clamp either. x = -900 on a 1080px screen
  // left zero pixels visible, and ACTION_UP persisted it — unrecoverable without
  // clearing app data, because the only way to move the overlay is its header.
  assert.match(service, /layoutParams\.x = clampOverlayX\(windowStartX \+ dx\)/);
  assert.match(service, /layoutParams\.y = clampOverlayY\(windowStartY \+ dy\)/);
  assert.doesNotMatch(serviceCode, /layoutParams\.x = windowStartX \+ dx;/,
    'the unclamped assignment must not come back');
});

test('clampOverlayX keeps a grabbable edge on screen, not merely one pixel', () => {
  assert.match(service, /EDGE_KEEP_DP\s*=\s*56/,
    'the retained edge must be a real touch target');
  assert.match(service, /int min = keep - width/);
  assert.match(service, /int max = screenW - keep/);
  // Degenerate case: an overlay wider than the screen must still resolve.
  assert.match(service, /if \(max < min\) return min;/);
});

test('a position read from preferences is clamped before it is trusted', () => {
  // A position saved on another screen size, in another orientation, or by a
  // build that did not clamp, can be entirely off-screen.
  // Scoped to the function body rather than a fixed byte window: a comment added
  // above the assignment pushed it past an arbitrary 1200-char slice, which made
  // the test fail on code that was correct. Bound the region by the next method
  // instead, so the check tracks structure and not character offsets.
  const start = service.indexOf('private void ensureOverlay()');
  const ensure = service.slice(start, service.indexOf('private void removeOverlay()', start));
  assert.ok(ensure.length > 0 && ensure.length < 4000, 'ensureOverlay body located');
  assert.match(ensure, /layoutParams\.x = clampOverlayX\(layoutParams\.x\)/);
  assert.match(ensure, /layoutParams\.y = clampOverlayY\(layoutParams\.y\)/);
});

test('the service re-clamps its geometry on rotation', () => {
  // Geometry is stored in pixels, so a portrait position can be off-screen in
  // landscape. MainActivity's onConfigurationChanged does not fire for a service.
  assert.match(service, /public void onConfigurationChanged\(Configuration newConfig\)/);
  assert.match(service, /handler\.post\(this::reclampOverlayGeometry\)/);
  assert.match(service, /private void reclampOverlayGeometry\(\)/);
});

test('the completion notification is guarded for API 24/25', () => {
  // minSdkVersion is 24. NotificationChannel and Notification.Builder(Context,
  // String) are API 26, and they were used unguarded — throwing
  // NoClassDefFoundError, which extends Error and so was NOT caught by the
  // surrounding `catch (Exception)`. The tick runnable died at the exact moment a
  // session completed.
  const fn = service.slice(
    service.indexOf('private void maybeNotifyCompletion()'),
    service.indexOf('private void maybeNotifyCompletion()') + 2600,
  );
  assert.match(fn, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.O/,
    'the channel path must be version-guarded');
  assert.match(fn, /new android\.app\.Notification\.Builder\(this\)/,
    'a pre-O builder path must exist');
  assert.match(fn, /catch \(Throwable ignored\)/,
    'an Error here must not kill the tick runnable');
});

test('the completion notification uses the real icon, not applicationInfo.icon', () => {
  // getApplicationInfo().icon is the launcher icon: on API 26+ an adaptive icon
  // renders as a white square in the status bar.
  const fn = service.slice(service.indexOf('private void maybeNotifyCompletion()'));
  assert.doesNotMatch(codeOnly(fn.slice(0, 2600)), /getApplicationInfo\(\)\.icon/);
  assert.match(fn.slice(0, 2600), /R\.drawable\.ic_notification/);
});

test('queued floating-timer action ids cannot collide', () => {
  // Was `millis + "-" + abs(type.hashCode())`, so two taps of the same button
  // inside one millisecond produced an identical id — and removeQueuedAction
  // filters by id, so acknowledging one dropped BOTH. A double-tapped "correct"
  // recorded one.
  assert.match(mainActivity, /FLOATING_ACTION_SEQ\.incrementAndGet\(\)/);
  assert.doesNotMatch(mainActivityCode, /Math\.abs\(type\.hashCode\(\)\)/,
    'the colliding id scheme must not come back');
});

test('the loopback HTTP server is shut down on a real finish', () => {
  // start() was called from onCreate, onStart and onResume; stop() was never
  // called. Two ServerSockets and their threads outlived every activity, and
  // PipHttpServer holds a static Context.
  assert.match(mainActivity, /PipHttpServer\.stop\(\)/);
  assert.match(mainActivity, /if \(isFinishing\(\)\)/,
    'must not tear down on a configuration change, which also calls onDestroy');
});

test('the HTTP request body is bounded', () => {
  // Content-Length is attacker-controlled and any app on the device can reach
  // 127.0.0.1:3000. A request claiming 100000000 with no body ran 100M
  // iterations; setSoTimeout does not bound it because read() returns
  // immediately at EOF rather than blocking.
  assert.match(httpServer, /MAX_BODY\s*=\s*64 \* 1024/);
  assert.match(httpServer, /if \(c < 0\) break;/,
    'in.read() returns -1 at EOF and (char) -1 is 0xFFFF — the loop must stop');
  assert.doesNotMatch(httpServerCode, /for \(int i = 0; i < contentLength; i\+\+\) body\.append\(\(char\) in\.read\(\)\);/);
});

test('connections use a bounded worker pool, not a thread per request', () => {
  // `new Thread(...)` per connection was unbounded: any local app could spawn
  // threads until the process died.
  assert.match(httpServer, /workers\.execute\(\(\) -> handle\(sock\)\)/);
  assert.match(httpServer, /new ThreadPoolExecutor\(/);
  assert.match(httpServer, /RejectedExecutionException/,
    'a rejected connection must be closed, not dropped silently');
  assert.doesNotMatch(httpServerCode, /new Thread\(\(\) -> handle\(sock\)\)\.start\(\)/);
});
