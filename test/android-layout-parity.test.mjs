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
