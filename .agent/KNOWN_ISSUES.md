# IsotopeAI Android — Known Issues

---

## ISSUE-001 — Destructive email availability check
**Severity:** CRITICAL
**Status:** FIXED IN CODE + UNIT TESTED (2026-06-29)

`android-bridge.js` previously handled `/__auth/check` by calling Supabase `/auth/v1/signup` with a generated dummy password. That is not a safe availability check and could create users, send confirmation mail, and consume auth rate limits.

**Current fix:** `/__auth/check` returns a neutral response and performs zero signup requests.

**Evidence:** `npm test` includes `/__auth/check is neutral and performs no signup request`.

---

## ISSUE-002 — Bootstrap contract mismatch
**Severity:** CRITICAL
**Status:** FIXED IN CODE + UNIT TESTED (2026-06-29)

Android bootstrap previously returned `onboarding_completed` without the canonical `onboarding` object, and returned the full `user_profiles` row as `profile` instead of exposing raw `profile_data`. `restore-and-launch.js` reads `snapshot.onboarding.completed`, `profile_data`, `cloud_snapshot`, `study_sessions_log`, and `stats_summary`, so boot routing could treat completed users as not onboarded.

**Current fix:** `/__auth/bootstrap` now returns the server-compatible shape, including `onboarding`, `onboarding_completed`, `profile`, `profile_data`, `profile_updated_at`, `settings`, `tours`, `stats_summary`, `daily_user_stats`, `study_sessions_log`, `cloud_snapshot`, `best_backup`, `backup_candidates`, `restore_recommended`, `backup_warning`, and `fetched_at`.

**Evidence:** `npm test` covers canonical completed onboarding, legacy `onboarding_completed`, seeded incomplete onboarding, legacy migration, nested `profile_data`, and network failure.

---

## ISSUE-003 — Auth navigation race after login
**Severity:** CRITICAL
**Status:** FIXED IN PATCH SCRIPT + UNIT TESTED (2026-06-30)

The compiled Auth bundle navigated to `/dashboard` whenever `signIn().success` was true. Since `auth-bridge.js` is loaded after `android-bridge.js` and becomes the active login implementation, login could race against restore/bootstrap routing and skip onboarding.

**Current fix:** `scripts/apply-android-patches.js` patches the Auth bundle login handler to call `window.__isoLogin`, wait for bootstrap, hydrate the auth Zustand store directly from the Android bootstrap/session, and route exactly once based on `bootstrap.onboarding.completed`.

**Evidence:** `npm test` includes `apply-android-patches makes Auth login route exactly once from bootstrap and hydrates auth state`.

---

## ISSUE-004 — Minified bundle patch compatibility
**Severity:** HIGH
**Status:** PARTIALLY VERIFIED

Required patch targets now fail the build if absent or ambiguous. The current source commit was tested locally with `npm run prepare-www`, `npm run apply-patches`, `npx cap sync android`, and a second `npm run apply-patches`.

**Remaining risk:** This is still a high-risk compatibility layer. More patch-contract coverage is needed for asset existence, hash reporting, JavaScript parsing of patched chunks, and index.html reference validation.

---

## ISSUE-005 — GitHub Actions access to isotope-code
**Severity:** HIGH
**Status:** UNKNOWN UNTIL PUSHED

The workflow checks out `Suydev/isotope-code` at pinned commit `fd39fad1384333ad774f19f35b754659a34dae60`. If that repository is private and the default GitHub token lacks access, the build will fail during checkout.

**Fix options if it fails:**
- Make `Suydev/isotope-code` accessible to the workflow.
- Add a cross-repo read token as a GitHub secret and configure checkout to use it.

---

## ISSUE-006 — Native notifications are code-level only
**Severity:** HIGH
**Status:** PARTIAL CODE FIX + UNIT TESTED + RESOURCE CONTRACT TESTED (2026-06-30)

The Web Notification polyfill is not sufficient for process-death reliability. A real Android notification implementation must schedule from an absolute timer completion timestamp, survive WebView process death where Android permits, restore after restart/reboot, and route notification taps to `/focus`.

**Current fix:** `android-bridge.js` exposes Capacitor LocalNotifications helpers for permission, scheduling, cancellation, channel creation, and tap routing. The notification store and focus store patches call these helpers on Android. The missing `ic_notification` drawable was added, bridge scheduling now uses that icon with `allowWhileIdle`, and `__isoScheduleFocusTimer` cancels the previous completion notification before scheduling a replacement.

**Remaining risk:** No emulator/physical-device evidence yet. Reboot persistence and Android process-death reliability still need APK testing.

---

## ISSUE-007 — Timer process-death behavior is unverified
**Severity:** HIGH
**Status:** OPEN

The timer still needs packaged APK tests for backgrounding, rotation, force-stop/relaunch, process recreation, clock changes, pause/resume, exactly-once completion, no duplicate Supabase session, and no duplicate notification.

---

## ISSUE-008 — Backup safety requires Android evidence
**Severity:** HIGH
**Status:** OPEN

`BLOCKED_EMPTY_OVERWRITE` must be preserved and verified in the packaged APK. Empty fresh install must never overwrite richer cloud data.

---

## ISSUE-009 — WAV sound files are large
**Severity:** MEDIUM
**Status:** OPEN

`www/sounds/` currently contributes about 41.8 MB after packaging: rain, wind, and crickets WAV files. Convert to OGG/AAC in a later size-reduction task only after core repair is stable.

---

## ISSUE-010 — GitHub CLI unavailable locally
**Severity:** MEDIUM
**Status:** OPEN

`gh` is not installed in this environment and `GITHUB_PAT` is not currently present. Baseline artifact download, `gh run list`, workflow log inspection, and PR creation cannot be done through the GitHub CLI unless `gh` is installed/authenticated or a token is provided. Normal `git push` may still work through existing git credentials.

---

## ISSUE-011 — Previous APK still looked like PWA and login fell back to create-account UI
**Severity:** CRITICAL
**Status:** FOLLOW-UP FIX WRITTEN + UNIT TESTED (2026-06-30)

User tested the previous GitHub-built APK and reported:

- Login shows loading after credentials, then the create-account page appears.
- Android notification permission is not requested.
- The APK still feels like a PWA rather than a native app.

**Likely causes found:**

- The patched Auth login still called the compiled `initializeAuth()`, which can re-read the compiled Supabase client/session state and flip the app back to logged-out UI.
- `restore-and-launch.js` can leave `window.__ISO_BOOT_STATE__.state="readyLoggedOut"` from startup, and AppAccessGate previously honored that stale state even after Android login hydrated the auth store.
- `index.html` still included PWA manifest/mobile-web-app metadata.
- The compiled `PWAManager` was still mounted globally.
- Notification scheduling still depended on browser service-worker/`setTimeout` behavior for key paths.

**Current fix:** Auth login now hydrates the auth store directly from Android bootstrap/session, refreshes `window.__ISO_BOOT_STATE__` before navigation, Android packaging strips PWA metadata, the Android app shell disables `PWAManager`, and notification/focus bundles call native scheduling helpers.

**Evidence:** `npm test` covers auth-store hydration, PWA manager disablement, manifest/meta removal, native notification scheduling hooks, and focus timer native scheduling hooks.

---

## ISSUE-012 — Supabase login succeeds but Android auth initializer loses the session
**Severity:** CRITICAL
**Status:** FOLLOW-UP FIX WRITTEN + UNIT TESTED (2026-06-30)

After commit `f1fa416`, the user reported a sharper reproduction: credentials show the IsotopeAI loading screen for about one second, then the app returns to login/create-account. Supabase Auth logs for the same window show `/token` returned HTTP 200, so Supabase accepted the credentials.

**Cause found:** `auth-bridge.js` writes the successful session to browser `localStorage`, but the compiled Supabase client storage adapter (`fr`) read only the app's IndexedDB-backed storage wrapper. `initializeAuth()` could therefore see no Supabase session and reset the auth store back to logged out.

**Current fix:** `scripts/apply-android-patches.js` patches the app bundle storage adapter so Android reads/writes/removes the bridge-compatible `localStorage` session keys.

**Evidence:** `npm test` includes `apply-android-patches lets Supabase auth storage read bridge-written sessions`. `npm run build` placed the fallback in both `www/assets/App-pJGjDiPw.js` and `android/app/src/main/assets/public/assets/App-pJGjDiPw.js`.

**Remaining risk:** Must be verified in a GitHub-built APK on an emulator or physical device. No ADB device is currently visible from this environment.

---

## ISSUE-013 — Stale startup boot state can override successful native login
**Severity:** CRITICAL
**Status:** FIXED IN PATCH SCRIPT + UNIT TESTED + LOCAL BUILD VERIFIED (2026-06-30)

After native login succeeds, `restore-and-launch.js` may still have `window.__ISO_BOOT_STATE__.state` set to `readyLoggedOut` from the initial no-session startup. The compiled Auth patch hydrated the auth store and navigated to dashboard/onboarding, but AppAccessGate then read the stale logged-out boot state and redirected back to `/auth`.

**Current fix:** The Auth bundle patch writes a fresh `window.__ISO_BOOT_STATE__` from the verified bootstrap result before navigation. AppAccessGate now honors `readyLoggedOut` only when the auth store is not authenticated, and its localStorage cleanup set no longer removes Android auth-session keys.

**Evidence:** `npm test` includes `apply-android-patches prevents stale logged-out boot state and preserves Android auth keys`. `npm run build` placed the fix in both `www/assets/Auth-Cw0VAaCZ.js` / `AppAccessGate-B975UtK7.js` and synced Android assets.

**Remaining risk:** Needs a new GitHub-built APK and ADB/device login test before the user-facing symptom can be marked fixed.

---

## ISSUE-014 — Android online/cloud sync can falsely show offline
**Severity:** CRITICAL
**Status:** CODE FIX WRITTEN + UNIT TESTED (2026-06-30)

The compiled `useOnlineStatus` hook read `navigator.onLine`, which is unreliable in the Android WebView context and can leave Settings/cloud sync showing offline or local-only mode while the device is connected.

**Current fix:** `android-bridge.js` now reads Capacitor Network status, overrides the Android `navigator.onLine` getter, exposes `window.__isoIsOnline()`, and dispatches `isotope:network`. `scripts/apply-android-patches.js` patches the compiled `useOnlineStatus` bundle to consume that Android state and event.

**Evidence:** `npm test` includes Android bridge network-state coverage and patch-contract coverage for `useOnlineStatus`.

**Remaining risk:** Needs GitHub-built APK install and online/cloud sync runtime evidence. Supabase RPC/storage failures must still be inspected if cloud sync remains broken after the false-offline fix.

---

## ISSUE-015 — Focus Picture-in-Picture was browser-only
**Severity:** HIGH
**Status:** CODE FIX WRITTEN + UNIT TESTED (2026-06-30)

Focus PiP depended only on browser `documentPictureInPicture`, which Android WebView does not provide.

**Current fix:** `MainActivity.java` exposes `window.IsotopeAndroid.enterFocusPip()` and `isPipSupported()` through a JavaScript interface. The Focus bundle now calls `window.__isoEnterFocusPip()` first on Android, and the manifest enables PiP/resizable activity.

**Evidence:** `npm test` covers bridge PiP delegation and patch/native resource contracts.

**Remaining risk:** Needs device/emulator PiP testing from the GitHub-built APK.

---

## ISSUE-016 — Native app polish gaps: logo, keyboard, back button, font scale
**Severity:** HIGH
**Status:** CODE FIX WRITTEN + UNIT TESTED (2026-06-30)

User reported the APK still felt PWA-like and requested the isotope-code logo, Android app-shell stabilization, and a proper Font Size section in Settings.

**Current fix:** Launcher vector and density PNG resources now use isotope-code logo assets; manifest uses `adjustResize`; bridge handles Capacitor back-button events; Settings bundle gets a matching Font Size slider persisted to profile/localStorage and applied by the bridge on startup.

**Evidence:** `npm test` verifies the Settings patch and Android native resource contracts. `npm run build` passed through sync and idempotent patching.

**Remaining risk:** Needs device layout/keyboard/back-button verification from the GitHub-built APK.
