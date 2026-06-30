# IsotopeAI Android — Session Log

---

## Session 2026-06-28 (Initial Build)

**Agent/account:** Replit Agent (initial session)
**Starting commit:** (none — new repo)
**Ending commit:** (pushing now via GitHub API)

**Objective:**
- Create Capacitor wrapper structure for IsotopeAI Android APK
- Implement android-bridge.js (fetch interceptor for all server endpoints)
- Set up GitHub Actions CI for debug APK builds
- Create full multi-agent handoff system

**Completed:**
- ✅ Cloned and audited isotope-code repo (30 subagents read all audit files + key bundles)
- ✅ Created package.json with Capacitor 6.2.x and all required plugins
- ✅ Created capacitor.config.json (appId: in.isotopeai.app, webDir: www)
- ✅ Created android-bridge.js — complete fetch interceptor:
  - handleLogin() → Supabase /auth/v1/token
  - handleSignup() → Supabase /auth/v1/signup
  - handleBootstrap() → Supabase REST user_profiles + user_onboarding
  - handleGetProfile() / handlePostProfile() → Supabase REST
  - handleUploadBackup() → Supabase Storage user-content bucket
  - handleGetLatestBackup() / handleGetBestBackup()
  - handleSnapshot() / handleRestoreBestBackup() / handleImport()
  - handleSupaProxy() → transparent /__supa/* forwarding
  - Static responses for /api/version, /api/health, /api/ai-config, /__isotope/ping
- ✅ Created scripts/prepare-www.js (copy public/ → www/, inject bridge, noop sw.js)
- ✅ Created scripts/apply-android-patches.js (5 bundle patches)
- ✅ Created .github/workflows/android.yml (debug + release APK CI)
- ✅ Created complete .agent/ handoff system (all 11 files)
- ✅ Created scripts/agent-resume.sh, agent-handoff.sh, agent-status.mjs

**Files changed:**
- android-bridge.js (new)
- package.json (new)
- capacitor.config.json (new)
- scripts/prepare-www.js (new)
- scripts/apply-android-patches.js (new)
- scripts/agent-resume.sh (new)
- scripts/agent-handoff.sh (new)
- scripts/agent-status.mjs (new)
- .github/workflows/android.yml (new)
- AGENTS.md (new)
- .agent/BOOTSTRAP.md (new)
- .agent/CURRENT_STATE.md (new)
- .agent/NEXT_TASKS.md (new)
- .agent/DECISIONS.md (new)
- .agent/ARCHITECTURE.md (new)
- .agent/TEST_STATUS.md (new)
- .agent/KNOWN_ISSUES.md (new)
- .agent/FILE_MAP.md (new)
- .agent/SESSION_LOG.md (new)
- .agent/state.json (new)
- .agent/last-test-output.txt (new)
- .agent/README.md (new)

**Commands run:**
- 30 async subagents launched to read all audit files + code bundles
- All files created via write tool (not yet pushed)

**Tests passed:** None (no APK built yet)
**Tests failed:** None

**Unresolved:**
- ISSUE-001: Bootstrap response missing restore_recommended field
- ISSUE-002: WAV sound files 43.8MB uncompressed
- ISSUE-003: Patch strings unverified against actual bundles
- ISSUE-004: GitHub Actions isotope-code repo access unknown
- ANDROID-005: APK not yet built

**Next exact action:**
```bash
# Push all files to GitHub and trigger CI build
node scripts/push-to-github.js
# Then check: https://github.com/Suydev/isotope-apk/actions
```

---

## Session 2026-06-29 (Android Production Repair)

**Agent/account:** Codex
**Branch:** codex/android-production-repair
**Starting state:** Existing APK still user-reported broken; all previous “fixed” claims treated as unverified.
**Ending state:** Ready to commit and push repair branch for GitHub Actions build.

**Objective:**
- Remove destructive `/__auth/check` signup behavior.
- Repair bootstrap/onboarding response contract and login routing.
- Commit stable Android project and update CI to build from the repair branch.
- Add regression tests for the highest-risk auth/bootstrap/patch issues.

**Completed:**
- Read required `.agent/` files, key repository files, recent commits, and the sibling `isotope-code` source/audit files.
- Updated `android-bridge.js`:
  - `/__auth/check` is neutral and non-destructive.
  - `/__auth/bootstrap` returns canonical server-compatible shape.
  - Onboarding completion uses verified PostgREST upsert with `on_conflict=user_id`.
  - Onboarding state no longer uses “row exists = onboarded”.
  - Network failure does not default unknown onboarding to false.
  - Selected RPC failures now propagate as `ok:false` instead of false success.
- Updated `scripts/prepare-www.js`:
  - Defaults to sibling `../isotope-code`.
  - Patches `restore-and-launch.js` for legacy `onboarding_completed` compatibility without defaulting unknown state to false.
- Updated `scripts/apply-android-patches.js`:
  - Required Auth patch routes login exactly once from bootstrap decision.
  - Required targets fail on missing/ambiguous matches.
  - Native manifest permissions and SDK versions are normalized.
- Generated and retained the native `android/` project.
- Updated GitHub Actions:
  - Runs on `codex/android-production-repair`.
  - Pins `isotope-code` to `fd39fad1384333ad774f19f35b754659a34dae60`.
  - Uses `npm ci`, runs `npm test`, syncs the committed Android project, and does not run `npx cap add android`.
- Added regression tests under `test/`.

**Commands run:**
- `node --check scripts/apply-android-patches.js`
- `node --check scripts/prepare-www.js`
- `npm install --package-lock-only`
- `npm test`
- `npm run prepare-www`
- `npm run apply-patches`
- `npx cap sync android`
- `npm run apply-patches`

**Tests passed:**
- 9 Node regression tests.
- `prepare-www` copied the real UI: 154 JS bundles, 56.9 MB.
- Android patch pass after sync: 0 skipped, 0 required failures.

**Not verified:**
- GitHub Actions APK build.
- Emulator or physical-device install.
- Packaged login/dashboard/onboarding flow.
- Backup restore, offline mode, native notifications, timer process-death recovery, import/export, and responsive Android matrix.

**Tooling limitation:**
- `gh` is not installed, so Actions inspection and PR creation through GitHub CLI are unavailable here.

**Next exact action:**
```bash
npm run agent:handoff
git add .gitignore android-bridge.js package.json package-lock.json scripts/prepare-www.js scripts/apply-android-patches.js .github/workflows/android.yml test android .agent
git commit -m "fix: repair Android auth bootstrap contract"
git push -u origin codex/android-production-repair
```

**Push/build result:**
- Commit pushed: `d33d38cf976528fe827f69dee21c6d3061ef0c85`
- Branch: `codex/android-production-repair`
- GitHub Actions debug APK build: PASS
- Run: https://github.com/Suydev/isotope-apk/actions/runs/28374915430
- Artifact: `IsotopeAI-debug-28` (artifact id `7953037831`)
- Draft PR: https://github.com/Suydev/isotope-apk/pull/1

**Next exact action after build:**
```bash
# Download IsotopeAI-debug-28 from the successful Actions run, then:
adb install -r app-debug.apk
adb logcat -c
adb logcat
```

---

## Session 2026-06-30 (Login/PWA/Native Notification Follow-Up)

**Agent/account:** Codex
**Branch:** codex/android-production-repair
**Starting commit:** `8abb671d4d8f`
**Ending state:** Follow-up patch ready to commit and push.

**User-reported APK result:**
- After credentials, login stayed loading and then returned to the create-account page.
- Android notification permission was not requested.
- The app still behaved like a PWA instead of a native app.

**Completed:**
- Patched Android Auth bundle replacement so successful `window.__isoLogin` hydrates the auth Zustand store directly from Android session/bootstrap and routes exactly once.
- Patched Android packaging to strip PWA manifest/mobile-web-app metadata.
- Patched App bundle to skip the compiled `PWAManager` on Android.
- Added native LocalNotifications bridge helpers in `android-bridge.js` for permission, channel creation, scheduling, cancellation, focus timer scheduling, and notification-tap routing to `/focus`.
- Patched notification and focus-store bundles to call native scheduling/cancel helpers on Android.
- Hardened patch idempotence so required patches do not re-apply into their own fallback expressions.
- Added regression coverage for auth-store hydration, PWA stripping, PWA manager disablement, and native notification/focus scheduling hooks.

**Commands run:**
- `node --check android-bridge.js`
- `node --check scripts/prepare-www.js`
- `node --check scripts/apply-android-patches.js`
- `npm test`
- `npm run prepare-www`
- `npm run apply-patches`
- `npx cap sync android`
- `npm run apply-patches`

**Tests passed:**
- 10 Node regression tests.
- `prepare-www` copied the real UI: 154 JS bundles, 56.9 MB.
- First patch pass: 14 patches, 0 skipped, 0 required failures.
- Final patch pass after sync: 0 bundle changes, 0 skipped, 0 required failures.

**Not verified:**
- Follow-up GitHub Actions APK build.
- Emulator or physical-device install.
- Real-device login, notification permission prompt, process-death notification, and app/PWA behavior.

**Tooling limitation:**
- `adb` is not installed in this environment, so device validation is still external.

**Next exact action:**
```bash
git add android-bridge.js scripts/prepare-www.js scripts/apply-android-patches.js test/prepare-patches.test.mjs .agent
git commit -m "fix: harden Android native login and notifications"
git push
```

---

## Session 2026-06-30 (Post-Login Session Persistence Follow-Up)

**Agent/account:** Codex
**Branch:** codex/android-production-repair
**Starting commit:** `f1fa416`
**Ending state:** Session-persistence/native-notification fix ready to commit and push; GitHub Actions build still needed.

**User-reported APK result after `f1fa416`:**
- User entered credentials.
- IsotopeAI loading screen appeared for about one second.
- App returned to login/create-account UI.
- Notification permission prompt still did not appear.

**Supabase evidence:**
- Local `.env` contains `SUPABASE_PAT`.
- Management API project lookup succeeded for `vteqquoqvksshmfhuepu`; project status is `ACTIVE_HEALTHY`.
- Auth config lookup succeeded; email auth is enabled and signup is not disabled.
- Recent Auth logs show the credential login reached Supabase `/token` and returned HTTP 200.
- Conclusion: the reported loop is not bad credentials; it is local Android app session/bootstrap state after successful Supabase auth.

**Root cause found:**
- `auth-bridge.js` writes the login session into browser `localStorage`.
- The compiled app's Supabase client uses storage adapter `fr`, which read only the app's IndexedDB-backed storage wrapper `x`.
- On Android, `initializeAuth()` could therefore call `U.getSession()`, see no session, and reset the auth store back to logged-out UI after the splash.
- Notification bridge also returned early when `window.Notification` existed, so native permission/channel/helper setup could be skipped in Android WebView.

**Completed:**
- Patched `scripts/apply-android-patches.js` so the compiled Supabase auth storage adapter falls back to Android bridge `localStorage` session keys:
  - `isotope-auth-token`
  - `sb-vteqquoqvksshmfhuepu-auth-token`
  - `isotope-last-session-raw`
- Patched the storage adapter to mirror set/remove operations into `localStorage` on Android.
- Patched `android-bridge.js` so native notification setup is installed even if WebView exposes `window.Notification`.
- Added regression tests for both fixes.
- Rebuilt Android assets with `npm run build`; generated `www/` and `android/app/src/main/assets/public` contain the new storage fallback and notification bridge behavior.

**Commands run:**
- `node --check android-bridge.js`
- `node --check scripts/apply-android-patches.js`
- `npm test`
- `npm run build`
- `java -version`
- `npm run android:debug`
- `adb devices -l`
- Supabase Management API project/config/log queries with token redaction.

**Tests passed:**
- `npm test`: 11 tests passed.
- `npm run build`: `prepare-www`, required patching, `npx cap sync android`, and final idempotent patch pass all succeeded.
- Supabase Auth log inspection confirmed login success at Supabase.

**Blocked/Not verified:**
- Local Termux Gradle APK build is blocked by missing Android SDK. Java 17 was installed, but Gradle requires `ANDROID_HOME` or `android/local.properties`.
- ADB is installed but no attached/authorized device is visible.
- No emulator/physical APK install or Logcat evidence for this new fix yet.
- GitHub Actions build must run after pushing this commit to produce the next debug APK.

**Next exact action:**
```bash
git add android-bridge.js scripts/apply-android-patches.js test/prepare-patches.test.mjs .agent
git commit -m "fix: persist Android auth session for app bootstrap"
git push
# then download the new IsotopeAI-debug-* artifact from GitHub Actions and inspect/install it
```
