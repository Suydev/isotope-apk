# IsotopeAI Android — Next Tasks

---

## Task Queue

### TASK ANDROID-012
**Priority:** P0
**Status:** ACTIVE
**Objective:** Runtime-test the GitHub-built Android Analytics stability + Supabase sync bridge checkpoint on device.

**Acceptance:**
- Checkpoint is committed and pushed to `codex/android-production-repair`.
- GitHub Actions completes for the new commit and artifact is downloaded/extracted and statically inspected.
- OnePlus Pad Go install/runtime checks are recorded.
- Device evidence distinguishes:
  - code written
  - unit tested
  - CI built
  - emulator tested
  - physical-device tested

**Current evidence:**
- `npm test`: PASS, 40 tests.
- `npm run build`: PASS through `prepare-www`, `apply-patches`, `npx cap sync android`, and final idempotent patch pass.
- `git diff --check`: PASS.
- Commit `8f5cb1f` pushed to `origin/codex/android-production-repair`.
- GitHub Actions run `28516820643`: PASS.
- Debug artifact: `IsotopeAI-debug-46`, artifact id `8009649602`.
- Artifact was downloaded with `GITHUB_PAT` from `.env`, extracted, statically inspected, and deleted locally.
- Latest checkpoint adds Android Analytics black-screen mitigation, profile/onboarding merge repair, storage bucket upload helpers, Headway/feedback link patches, and native WebView resume recovery.
- Local artifact download from the GitHub API is blocked by HTTP 401 because no `GITHUB_PAT`/`GH_TOKEN`/`gh` auth exists in this shell.
- Local Gradle/APK build intentionally not run by user instruction; use GitHub Actions for APK assembly.

**Exact next commands:**
```bash
set -a; . ./.env; set +a
curl -fL -H "Authorization: Bearer $GITHUB_PAT" -H "Accept: application/vnd.github+json" -o .artifact-tmp/isotope-8f5cb1f.zip https://api.github.com/repos/Suydev/isotope-apk/actions/artifacts/8009649602/zip
unzip .artifact-tmp/isotope-8f5cb1f.zip -d .artifact-tmp/isotope-8f5cb1f
adb devices
adb install -r .artifact-tmp/isotope-8f5cb1f/app-debug.apk
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
- Group icon uploads use `group-icons`; study material uploads use `study-material`.
- Supabase Storage old archive cleanup is verified against only current-user stale JSON archive paths.

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
- Focus/Analytics intermittent black-screen/open failure is retested with route, WebView console, and Logcat evidence.
- Analytics Monthly past-session switching does not blank the WebView.

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
