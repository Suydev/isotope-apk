# IsotopeAI Android — Next Tasks

---

## Task Queue

### TASK ANDROID-005
**Priority:** P0
**Status:** DONE
**Objective:** Push `codex/android-production-repair` and trigger a GitHub Actions debug APK build.

**Acceptance condition:**
- `npm run agent:handoff` has been run.
- Repair branch is committed and pushed to `origin/codex/android-production-repair`.
- GitHub Actions starts for the pushed branch.
- Debug APK build succeeds and uploads `app-debug.apk`.
- Test evidence is recorded in `.agent/TEST_STATUS.md`.

**Commands already run locally:**
- `node --check scripts/apply-android-patches.js`
- `node --check scripts/prepare-www.js`
- `npm test`
- `npm run prepare-www`
- `npm run apply-patches`
- `npx cap sync android`
- `npm run apply-patches`

**Exact next commands:**
```bash
npm run agent:handoff
git add .gitignore android-bridge.js package.json package-lock.json scripts/prepare-www.js scripts/apply-android-patches.js .github/workflows/android.yml test android .agent
git commit -m "fix: repair Android auth bootstrap contract"
git push -u origin codex/android-production-repair
```

**Notes:**
- `gh` is not installed in this environment. If GitHub Actions monitoring is needed from the shell, install/authenticate `gh` or inspect the Actions tab in the browser.
- The workflow now builds this repair branch and pins `isotope-code` to `fd39fad1384333ad774f19f35b754659a34dae60`.
- Completed by run https://github.com/Suydev/isotope-apk/actions/runs/28374915430. Artifact: `IsotopeAI-debug-28`.

---

### TASK ANDROID-006
**Priority:** P0
**Status:** ACTIVE
**Objective:** Build and install the follow-up APK for the user-reported Android-native wiring failures after login.

**Acceptance:**
- APK contains the real IsotopeAI UI, not placeholder React UI.
- Android package no longer exposes PWA manifest/mobile-web-app metadata or compiled PWA manager UI.
- Existing account logs in and routes to `/dashboard` only when bootstrap says onboarding is complete.
- New account logs in and routes to `/onboarding` when `user_onboarding.completed=false`.
- Bootstrap network failure shows loading/retry behavior instead of assuming dashboard or onboarding.
- Supabase auth storage reads the bridge-written Android session and does not reset the user to login/create-account after the splash.
- Cloud sync/online status uses Capacitor Network and does not falsely show offline while Android is connected.
- Android notification permission prompt is requested through Capacitor LocalNotifications.
- Focus timer schedules/cancels native notifications using absolute timestamps.
- Notification resources are valid and scheduled notifications use `ic_notification` with `allowWhileIdle`.
- Focus Picture-in-Picture uses the native Android PiP bridge where available.
- Android back button navigates/backs/minimizes without abruptly closing active app flows.
- Keyboard inset behavior uses `adjustResize`.
- Settings includes a matching Font Size control and persists/apply device text scale.
- Launcher icon resources use isotope-code logo assets, not default Android assets.
- WebView console and Logcat evidence are captured with tokens redacted.

**Current evidence:**
- Supabase Auth logs show the user-reported credential attempt returned HTTP 200 from `/token`.
- Fresh root cause found after the user retested `ce73a3f`: the startup boot state could remain `readyLoggedOut` after native login and AppAccessGate redirected the now-authenticated user back to `/auth`.
- Local regression tests cover auth-store routing, canonical bootstrap response handling, Android auth storage fallback, PWA stripping, PWA manager disablement, and native notification/focus hooks.
- Local regression tests now also cover Auth writing a fresh Android boot state after login, AppAccessGate ignoring stale `readyLoggedOut` once authenticated, and preserving Android auth session keys during storage cleanup.
- `npm run build` succeeds through `prepare-www`, required patching, Capacitor sync, and final idempotent patching.
- Generated `www/` and synced `android/app/src/main/assets/public` contain `window.__ISO_BOOT_STATE__` login refresh, `readyDashboard` / `readyNeedsOnboarding` routing, and `Y === "readyLoggedOut" && !u`.
- GitHub Actions passed for commit `ce73a3f` in push run `28415768373` and PR run `28415767170`.
- Downloaded artifact `IsotopeAI-debug-35` (id `7969405842`) was extracted and statically inspected.
- APK path for install testing: `/data/data/com.termux/files/usr/tmp/isotope-apk-ce73a3f/artifact/app-debug.apk`.
- Current code-level Android-native wiring pass is implemented locally:
  - `android-bridge.js` now exposes Capacitor Network backed `__isoIsOnline`, native PiP globals, Android back button handling, startup font-scale application, and corrected notification scheduling.
  - `scripts/apply-android-patches.js` patches online status, Focus PiP, Settings Font Size, notification/focus scheduling, and verifies native resources.
  - `MainActivity.java` exposes `IsotopeAndroid` JavaScript interface for Focus PiP.
  - Manifest/resource/config changes cover PiP, keyboard resize, notification icon, launcher logo, and LocalNotifications config.
- `npm test` passes 18 tests.
- `npm run build` passes with first patch pass applying 23 targets and final patch pass applying 0.
- Per user instruction, do not run local Gradle. Use GitHub Actions for APK assembly.
- `adb devices -l` currently shows no attached/authorized target.

**Exact next commands:**
```bash
git add android-bridge.js capacitor.config.json scripts/apply-android-patches.js test android .agent
git commit -m "fix: wire Android native app behavior"
git push
```

---

### TASK ANDROID-007
**Priority:** P0
**Status:** TODO
**Objective:** Verify backup safety and restore behavior in the packaged APK.

**Acceptance:**
- Empty fresh install does not overwrite rich cloud backup.
- Rich local data plus empty cloud is handled without data loss.
- Both-changed and corrupt-cloud cases produce safe warnings.
- `BLOCKED_EMPTY_OVERWRITE` evidence is recorded.

---

### TASK ANDROID-008
**Priority:** P0
**Status:** PARTIAL
**Objective:** Implement real native focus timer notifications and process-death recovery.

**Acceptance:**
- Timer schedules native notification from an absolute completion timestamp.
- Pause/resume/reset/duration changes cancel or reschedule notification.
- Notification survives WebView process death where Android permits.
- Notification tap opens `/focus`.
- Android 13+ notification permission denial is handled cleanly.

**Current state:** Code-level bridge and bundle patches exist and are covered by regression tests. Device/process-death evidence is still required before marking done.

---

### TASK ANDROID-009
**Priority:** P1
**Status:** TODO
**Objective:** Verify local-only mode in the packaged APK.

**Acceptance:**
- Dashboard, tasks, subjects, syllabus, focus timer, sessions, analytics, habits, exams/tests, preferences, and local import/export work while logged out or offline.
- Expired-token offline startup does not destroy local state.

---

### TASK ANDROID-010
**Priority:** P1
**Status:** TODO
**Objective:** Run responsive and orientation verification on Android.

**Acceptance:**
- 360x800, 800x360, 412x915, 600x960, 800x1280, and 1280x800 layouts are checked.
- Navigation, forms, modals, keyboard insets, safe areas, charts, focus timer, settings, onboarding, and community have no clipping or horizontal overflow.
