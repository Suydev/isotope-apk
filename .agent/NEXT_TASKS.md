# IsotopeAI Android — Next Tasks

---

## Task Queue

### TASK ANDROID-012
**Priority:** P0
**Status:** ACTIVE
**Objective:** Commit, push, and verify the combined Android Floating Timer + Supabase sync bridge repair through GitHub Actions.

**Acceptance:**
- Branch `codex/android-production-repair` is committed and pushed.
- GitHub Actions debug APK build succeeds.
- Artifact is downloaded/extracted and statically inspected.
- OnePlus Pad Go install/runtime checks are recorded.
- Device evidence distinguishes:
  - code written
  - unit tested
  - CI built
  - emulator tested
  - physical-device tested

**Current evidence:**
- `npm test`: PASS, 33 tests.
- `npm run build`: PASS through `prepare-www`, `apply-patches`, `npx cap sync android`, and final idempotent patch pass.
- `git diff --check`: PASS.
- Local Gradle/APK build intentionally not run by user instruction; use GitHub Actions for APK assembly.

**Exact next commands:**
```bash
npm run agent:handoff
git add .github/workflows/android.yml android-bridge.js android-floating-timer-bridge.js android-pip-bridge.js android/app android/build.gradle android/capacitor.settings.gradle android/gradle/wrapper/gradle-wrapper.properties capacitor.config.json package.json package-lock.json scripts/apply-android-patches.js scripts/prepare-www.js test .agent
git commit -m "fix(android): repair sync bridge and floating timer"
git push -u origin codex/android-production-repair
```

---

### TASK ANDROID-013
**Priority:** P0
**Status:** TODO
**Objective:** Runtime test the newly built APK for Supabase connectivity beyond login.

**Acceptance:**
- Login reaches the correct route and stays authenticated.
- Settings/cloud sync does not falsely say offline while Android is online.
- Manual backup uploads canonical objects:
  - `userId/backups/latest.json`
  - `userId/backups/history/*.json`
  - `userId/cloud-snapshot/latest.json`
- Empty fresh local state cannot overwrite rich cloud data (`BLOCKED_EMPTY_OVERWRITE`).
- Restore returns and applies `backup_json`.
- Import archives to `userId/imports/*` and promotes canonical backup.
- Old stale archive files are cleaned only after verified upload/readback.
- Community leaderboard/group analytics/session sync call real Supabase REST/RPC paths with useful errors on failure.

---

### TASK ANDROID-014
**Priority:** P0
**Status:** TODO
**Objective:** Runtime test Floating Timer and focus page stability on OnePlus Pad Go.

**Acceptance:**
- Lecture displays `🎓`.
- Questions/Practice/Revision session opens Floating Timer.
- Display-over-other-apps permission flow works.
- Rounded floating card has no black outer rectangle.
- Dragging over another app works.
- Correct/Incorrect/Skip/Undo update the real store counts.
- Target changes persist.
- Timer continues while the main app is backgrounded.
- Expand returns to `/focus`.
- Close removes service/overlay.
- No orphan overlay remains after session completion or app restart.
- Focus page intermittent black-screen/open failure is reproduced with route, WebView console, and Logcat evidence.

---

### TASK ANDROID-015
**Priority:** P1
**Status:** TODO
**Objective:** Repair remaining UI polish after runtime sync/focus evidence.

**Acceptance:**
- Dark-mode launcher/app logo appearance is corrected without replacing the IsotopeAI UI.
- Keyboard flicker and Android back-button behavior are verified on device and fixed if still present.
- Smoothness issues are profiled with runtime evidence before further changes.
- Admin/server-only panels are confirmed absent from packaged APK; community role labels are not removed.

---

### TASK ANDROID-016
**Priority:** P1
**Status:** TODO
**Objective:** Run responsive and orientation verification on Android.

**Acceptance:**
- 360x800, 800x360, 412x915, 600x960, 800x1280, and 1280x800 layouts are checked.
- Navigation, forms, modals, keyboard insets, safe areas, charts, focus timer, settings, onboarding, and community have no clipping or horizontal overflow.

---

### TASK ANDROID-017
**Priority:** P2
**Status:** TODO
**Objective:** Plan Capacitor 8 migration to resolve dev dependency audit findings.

**Acceptance:**
- Run separately from the production sync/focus repair.
- Validate native bridge, patch scripts, Capacitor plugins, Gradle, and GitHub Actions after migration.
- Do not use `npm audit fix --force` inside the current repair checkpoint.
