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
**Objective:** Install the GitHub-built debug APK and verify auth routing on Android.

**Acceptance:**
- APK contains the real IsotopeAI UI, not placeholder React UI.
- Existing account logs in and routes to `/dashboard` only when bootstrap says onboarding is complete.
- New account logs in and routes to `/onboarding` when `user_onboarding.completed=false`.
- Bootstrap network failure shows loading/retry behavior instead of assuming dashboard or onboarding.
- WebView console and Logcat evidence are captured with tokens redacted.

**Exact next commands:**
```bash
# Download IsotopeAI-debug-28 from:
# https://github.com/Suydev/isotope-apk/actions/runs/28374915430
adb install -r app-debug.apk
adb logcat -c
adb logcat
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
**Status:** TODO
**Objective:** Implement real native focus timer notifications and process-death recovery.

**Acceptance:**
- Timer schedules native notification from an absolute completion timestamp.
- Pause/resume/reset/duration changes cancel or reschedule notification.
- Notification survives WebView process death where Android permits.
- Notification tap opens `/focus`.
- Android 13+ notification permission denial is handled cleanly.

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
