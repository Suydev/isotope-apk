# IsotopeAI Android — Next Tasks

---

## Task Queue

---

### TASK ANDROID-001
**Priority:** P0
**Status:** DONE
**Objective:** Set up Capacitor project structure with package.json, capacitor.config.json, GitHub Actions CI.
**Acceptance:** Files exist in repo. CI workflow is valid YAML.
**Completed:** 2026-06-28

---

### TASK ANDROID-002
**Priority:** P0
**Status:** DONE
**Objective:** Build android-bridge.js — fetch interceptor for all /__auth/* and /__supa/* routes.
**Acceptance:** Bridge handles login, signup, bootstrap, profile GET/POST, backup upload/download, snapshot, restore-best-backup, import.
**Completed:** 2026-06-28
**Notes:** Response shapes verified against server.mjs and auth-bridge.js subagent analysis.

---

### TASK ANDROID-003
**Priority:** P0
**Status:** DONE
**Objective:** Build scripts/prepare-www.js — copies isotope-code/public/ to www/, injects bridge, patches sw.js.
**Acceptance:** www/ is ready for cap sync after running this script.
**Completed:** 2026-06-28

---

### TASK ANDROID-004
**Priority:** P0
**Status:** DONE
**Objective:** Build scripts/apply-android-patches.js — patches App bundle with Supabase constants and server-side patches.
**Acceptance:** Script patches all 5 bundles (App, sessionSync, AppAccessGate, useInvites, Focus).
**Completed:** 2026-06-28

---

### TASK ANDROID-005
**Priority:** P0
**Status:** ACTIVE
**Objective:** Trigger first successful debug APK build via GitHub Actions.
**Relevant files:**
- `.github/workflows/android.yml`
- `android-bridge.js`
- `scripts/prepare-www.js`
- `scripts/apply-android-patches.js`
- `capacitor.config.json`
- `package.json`

**Dependencies:** ANDROID-001 through ANDROID-004 (all done)

**Acceptance condition:**
- `npm run agent:handoff` completes cleanly
- All files pushed to GitHub main branch
- GitHub Actions build starts (visible in Actions tab)
- Build succeeds: `app-debug.apk` artifact uploaded
- APK can be installed on Android device/emulator

**Required tests:**
- Download APK from GitHub Actions artifact
- `adb install app-debug.apk`
- Launch app — should see IsotopeAI login screen (NOT placeholder)
- Log in with real Supabase credentials
- Verify data loads (dashboard visible, no white screen)

**Exact next command:**
```bash
# 1. Run handoff to finalize state files
npm run agent:handoff

# 2. Check that all files are committed and pushed
git --no-optional-locks status
git log --oneline -3

# 3. Verify GitHub Actions started
# Check: https://github.com/Suydev/isotope-apk/actions
```

**Current blocker:** Files need to be pushed to GitHub via API (git push requires PAT).

---

### TASK ANDROID-006
**Priority:** P1
**Status:** TODO
**Objective:** Verify login → dashboard → data flow in physical/emulated Android device.
**Relevant files:**
- `android-bridge.js` (login handler, bootstrap handler)
- `www/auth-bridge.js` (client-side auth)
- `www/restore-and-launch.js` (boot routing)

**Dependencies:** ANDROID-005 (APK built)

**Acceptance:**
- Log in with real Supabase credentials
- Dashboard shows correct data from IndexedDB
- New device: restore-best-backup flow triggers and restores cloud data
- Timer starts and persists through app backgrounding
- Settings export/import works

**Required tests:**
- Fresh install + login + dashboard data visible
- Background app for 5min, return — timer still correct
- Export JSON from Settings, verify file saved
- Import JSON, verify data merged

---

### TASK ANDROID-007
**Priority:** P1
**Status:** TODO
**Objective:** Convert WAV sound files to OGG to reduce APK size by ~36MB.
**Relevant files:**
- `scripts/prepare-www.js` (add ffmpeg conversion step)
- `www/sounds/` (rain.wav, wind.wav, crickets.wav)

**Dependencies:** ANDROID-005

**Acceptance:**
- sound files in www/sounds/ are .ogg format, each <3MB
- APK total size reduced by at least 30MB
- Ambient sounds still play in app

**Notes:**
- Requires ffmpeg in CI environment
- Add to GitHub Actions: `apt-get install -y ffmpeg`
- Conversion: `ffmpeg -i rain.wav -c:a libvorbis -q:a 4 rain.ogg`

---

### TASK ANDROID-008
**Priority:** P1
**Status:** TODO
**Objective:** Implement native @capacitor/local-notifications for focus timer completion.
**Relevant files:**
- `android/app/src/main/java/in/isotopeai/app/` (Kotlin activity)
- `www/assets/useFocusStore-CX_Nyp1h.js` (timer store)
- `android-bridge.js` (add notification scheduling helper)

**Dependencies:** ANDROID-005

**Acceptance:**
- App sends notification when Pomodoro timer completes
- Notification appears when app is backgrounded
- Tapping notification returns to app on Focus screen
- Notification permission requested on first launch

**Required tests:**
- Start 25min timer, minimize app, wait for completion
- Verify notification appears in Android notification shade
- Tap notification, verify app opens to Focus screen

---

### TASK ANDROID-009
**Priority:** P2
**Status:** TODO
**Objective:** Implement @capacitor/filesystem for native JSON export/import.
**Relevant files:**
- `www/assets/SettingsLayout-B4OgCkQ5.js` (export/import UI)
- `android-bridge.js` (add filesystem helper window functions)

**Dependencies:** ANDROID-006

**Acceptance:**
- "Export backup" button saves JSON to Android Downloads folder
- "Import backup" button shows native file picker
- Exported file survives app uninstall/reinstall

---

### TASK ANDROID-010
**Priority:** P2
**Status:** TODO
**Objective:** Implement background timer via Android WorkManager for process-death resilience.
**Relevant files:**
- `android/app/src/main/java/in/isotopeai/app/` (new WorkManager classes)
- Capacitor custom plugin needed

**Dependencies:** ANDROID-008

**Notes:**
- When Android kills the WebView process, the JS timer stops
- WorkManager can fire notifications even after process death
- Requires: native Kotlin plugin + Capacitor bridge method
