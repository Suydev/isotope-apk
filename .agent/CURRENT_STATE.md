# IsotopeAI Android — Current State

**Updated:** 2026-06-30T07:39:16Z
**Branch:** codex/android-production-repair
**Current phase:** ANDROID-006 — Android-native wiring for online sync, notifications, PiP, logo, and shell behavior

---

## Verified This Session

- [x] `npm test` passes 18 regression tests for auth/bootstrap/onboarding/PWA/session-storage/stale-boot-state/native-notification/network/PiP/patch-resource contracts.
- [x] Android bridge now uses Capacitor Network as the authoritative Android online source, overrides `navigator.onLine`, and dispatches `isotope:network` events consumed by the patched `useOnlineStatus` bundle.
- [x] Android bridge now schedules native notifications with `ic_notification`, `allowWhileIdle`, and cancellation before focus timer reschedules.
- [x] Added the missing Android `ic_notification` drawable and removed the nonexistent `beep` sound reference from Capacitor LocalNotifications config.
- [x] `MainActivity.java` now exposes a JavaScript interface named `IsotopeAndroid` for Focus Picture-in-Picture and dispatches `isotope:pip-mode` events.
- [x] `AndroidManifest.xml` now enables PiP/resizable activity and uses `adjustResize` for keyboard insets.
- [x] Focus bundle patch delegates Picture-in-Picture to the Android bridge before falling back to browser `documentPictureInPicture`.
- [x] Settings bundle patch adds a matching Font Size control and persists `fontScale` / `isotope-font-scale`; bridge applies the persisted scale at startup.
- [x] Android back-button handling is wired through the Capacitor App plugin to close dialogs, navigate back inside the app, or minimize at root routes.
- [x] Android launcher foreground/background and density PNG icons were replaced with isotope-code logo assets; no default Android robot launcher icon remains in the committed resources.
- [x] `npm run build` succeeds through `prepare-www`, required bundle patching, `npx cap sync android`, and the final idempotent patch pass. First pass applied 23 patch targets; second pass applied 0.
- [x] Patch-contract tests verify Android online hook, Focus PiP hook, Settings Font Size hook, notification icon resource, launcher logo resource, PiP manifest/activity wiring, and notification config.
- [x] GitHub Actions runs for commit `868b889` reached the Android compile step after tests/patching/sync all passed, then failed in `Build Debug APK`:
  - Push run `28428151528`
  - PR run `28428153462`
- [x] Follow-up native compile fix written locally: `MainActivity.onStart()` now remains `public`, matching `BridgeActivity`; regression test asserts it is not `protected`.
- [x] Supabase Management API access works with local `SUPABASE_PAT`; project `vteqquoqvksshmfhuepu` is `ACTIVE_HEALTHY`.
- [x] Supabase Auth logs show the user-reported credential attempt reached `/token` and returned HTTP 200, so the reported login loop is local Android session/routing behavior after successful Supabase auth.
- [x] Root cause found for the repeated post-login loop: `restore-and-launch.js` can leave `window.__ISO_BOOT_STATE__.state="readyLoggedOut"` from startup, and `AppAccessGate` honored that stale state after Auth hydrated the Android session.
- [x] Auth bundle patch now writes a fresh `window.__ISO_BOOT_STATE__` from bootstrap before navigating after native login.
- [x] AppAccessGate bundle patch now redirects `readyLoggedOut` to `/auth` only when the auth store is not authenticated.
- [x] AppAccessGate storage cleanup patch now preserves Android auth keys instead of deleting `isotope-auth` / `isotope-auth-token`.
- [x] `npm run prepare-www` copies the real `isotope-code/public` UI into `www/` and reports 154 JS bundles, total size 56.9 MB.
- [x] `npx cap sync android` succeeds and copies web assets into the committed Android project.
- [x] Generated `www/` and `android/app/src/main/assets/public` both contain the new Auth boot-state write and AppAccessGate stale-logged-out guard.
- [x] `npm run agent:status` now reports `ANDROID-006` as the active task after fixing the task-block parser.
- [x] GitHub Actions builds for commit `ce73a3f` succeeded:
  - Push run `28415768373`
  - PR run `28415767170`
- [x] Debug artifact `IsotopeAI-debug-35` (artifact id `7969405842`) was downloaded and extracted locally.
- [x] Extracted APK contains the real IsotopeAI UI: 154 JS chunks and 266 packaged public files.
- [x] Extracted APK contains the Android auth storage fallback in `assets/App-pJGjDiPw.js`.
- [x] Extracted APK contains native notification bootstrap helpers and does not skip native setup when `window.Notification` exists.
- [x] `aapt dump permissions` confirms packaged permissions include `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `SCHEDULE_EXACT_ALARM`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, and `INTERNET`.
- [x] `/__auth/check` no longer calls Supabase signup and is covered by regression test.
- [x] `/__auth/bootstrap` now returns the canonical server-compatible shape, including `onboarding`, `profile_data`, restore metadata, and backup fields.
- [x] Onboarding completion now uses verified PostgREST upsert with `on_conflict=user_id`.
- [x] Auth bundle patch waits for bootstrap onboarding decision before routing to dashboard/onboarding.
- [x] Auth bundle patch now hydrates the Zustand auth store directly from Android bootstrap after login, instead of calling compiled `initializeAuth()` which can flip back to logged-out UI.
- [x] App bundle patch now makes the compiled Supabase auth storage adapter read/write/remove the bridge-written `localStorage` session fallback on Android (`isotope-auth-token`, `sb-vteqquoqvksshmfhuepu-auth-token`, `isotope-last-session-raw`), preventing `initializeAuth()` from treating a just-logged-in user as logged out.
- [x] Android packaging removes PWA manifest/mobile-web-app meta tags and disables the compiled `PWAManager` on Android.
- [x] Notification and focus timer bundles now call Capacitor `LocalNotifications` scheduling/cancel APIs through Android bridge globals instead of relying only on browser `setTimeout`/service-worker notification paths.
- [x] Android bridge now always installs the native notification helper path on Android, even if WebView exposes a `window.Notification` object.
- [x] Android project has been generated once and is ready to commit instead of being regenerated by CI.
- [x] Branch `codex/android-production-repair` pushed to `https://github.com/Suydev/isotope-apk`.
- [x] GitHub Actions debug build succeeded: https://github.com/Suydev/isotope-apk/actions/runs/28374915430
- [x] Debug artifact uploaded as `IsotopeAI-debug-28` (artifact id `7953037831`, zip size 44,653,663 bytes).
- [x] Draft PR opened: https://github.com/Suydev/isotope-apk/pull/1

## Not Yet Verified

- [ ] GitHub Actions debug APK build for the follow-up native compile fix.
- [ ] Download/extract static inspection of the current GitHub Actions APK artifact.
- [ ] Follow-up APK installation on emulator or physical Android device.
- [ ] Login with real credentials inside the follow-up packaged APK.
- [ ] Existing-account dashboard route in follow-up packaged APK.
- [ ] New-account onboarding completion in packaged APK.
- [ ] Offline mode, import/export, backup restore, notifications, timer process-death behavior, and responsive layout matrix on Android.

## Important Implementation State

- User tested the previous GitHub-built APK and reported: login now reaches the app shell but cloud sync/online status still says offline, notification permission appears without actual focus notification delivery, Android app shell behavior still feels PWA-like, keyboard/back behavior is unstable, old launcher logo remains, and Focus PiP/font scale controls are missing.
- Root cause evidence: Supabase logs show Auth login succeeded with HTTP 200. Two Android-side failure paths were then found: the compiled Supabase storage adapter could miss the bridge-written `localStorage` session, and `AppAccessGate` could trust a stale startup `readyLoggedOut` boot state even after Auth hydrated the session.
- Follow-up code-level fixes now target Android-native wiring rather than Supabase credentials: Capacitor Network feeds online state, notification resource/scheduling is aligned, Focus PiP is native, app back/keyboard shell behavior is native-aware, and old launcher resources are replaced.
- `isotope-code` source assets are pinned for CI at commit `fd39fad1384333ad774f19f35b754659a34dae60`.
- Capacitor versions are pinned in `package.json` and `package-lock.json`.
- `.github/workflows/android.yml` now runs on `main` and `codex/android-production-repair`, uses `npm ci`, runs `npm test`, prepares `www/`, applies patch checks, runs `npx cap sync android`, reapplies native patches, and builds the debug APK.
- `gh` is not installed in this environment and `.env` currently has no `GITHUB_PAT`. Branch push works through existing git credentials; Actions/artifact inspection may need browser access, an installed/authenticated `gh`, or `GITHUB_PAT`.
- `adb` is installed, but `adb devices -l` currently shows no attached/authorized device.
- Per user instruction, do not use local Gradle for APK assembly in this environment. GitHub Actions is the only APK build path for this checkpoint.

## Last Successful Build

- GitHub Actions run `28415768373`
- Commit: `ce73a3f`
- URL: https://github.com/Suydev/isotope-apk/actions/runs/28415768373
- Job: `Build Debug APK` succeeded

## Last Successful APK Path

- Artifact: `IsotopeAI-debug-35`
- Artifact id: `7969405842`
- Downloaded APK: `/data/data/com.termux/files/usr/tmp/isotope-apk-ce73a3f/artifact/app-debug.apk`
- Download page: https://github.com/Suydev/isotope-apk/actions/runs/28415768373

## Current Blocker

No emulator or physical Android device is visible to ADB from this environment. Runtime claims must not be marked complete until the follow-up GitHub-built APK is installed and tested. APK assembly must be done by GitHub Actions only for this checkpoint. The latest pushed Actions run failed at native debug build; a targeted `MainActivity.onStart()` compile fix is local and must be pushed.

## Exact Next Commands

```bash
git add android/app/src/main/java/in/isotopeai/app/MainActivity.java test/prepare-patches.test.mjs .agent
git commit -m "fix: restore MainActivity onStart access"
git push
```
