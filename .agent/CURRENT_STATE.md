# IsotopeAI Android — Current State

**Updated:** 2026-07-01T18:20:42+05:30
**Branch:** codex/android-production-repair
**Current phase:** ANDROID-012 — Android Supabase sync/Floating Timer/Analytics stability repair awaiting new GitHub APK + device tests

---

## Verified Locally This Session

- [x] `npm run agent:resume` completed on `codex/android-production-repair`.
- [x] Supabase changelog checked for current breaking-change risk. Relevant risk remains Data API/RLS/Storage permission shape, not a changed client endpoint.
- [x] Replaced broken Android system-PiP timer path with `android-floating-timer-bridge.js` + native `FloatingTimerService`.
- [x] Removed old `android-pip-bridge.js` and unused PiP RemoteAction icons.
- [x] Added grapheme-safe focus-type emoji repair; corrupted Lecture `����` repairs to `🎓`.
- [x] Added offline LaTeX font packaging repair for missing KaTeX font assets.
- [x] Pruned Android-unused browser/PWA artifacts from packaged `www`.
- [x] Added conservative WebView smoothness/stability flags:
  - manifest `android:hardwareAccelerated="true"`
  - `WebView.LAYER_TYPE_HARDWARE`
  - `setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)`
- [x] Repaired Android Supabase disconnect paths in `android-bridge.js`:
  - direct absolute Supabase `/functions/v1/*` calls are intercepted, not only `/__supa/functions/v1/*`
  - `finish-session` maps compiled payloads to `finish_session_sync(p_session_id,p_action,p_duration_minutes,p_group_id,p_session_type,p_notes,p_ended_at)`
  - daily leaderboard maps to existing `get_leaderboard` with `p_period:"daily"` instead of nonexistent `get_daily_leaderboard`
  - group leaderboard maps `groupId` to `p_group_id`
  - group analytics maps `groupId/days` to `p_group_id/p_days`
  - non-2xx RPCs return `ok:false`, not fake success
- [x] Repaired Android backup/import/restore wiring:
  - uploads canonical `userId/backups/latest.json`
  - writes timestamped `userId/backups/history/*.json`
  - writes `userId/cloud-snapshot/latest.json`
  - imports archive to `userId/imports/*` and promote canonical backup
  - restore endpoints return `backup_json`, `selected_backup`, candidates, and collection counts
  - `BLOCKED_EMPTY_OVERWRITE` blocks empty local state overwriting rich cloud state
  - cleanup deletes only current-user stale `.json` archive paths after verified upload/readback
  - explicit `/__auth/storage/cleanup-preview` and `/__auth/storage/cleanup-apply` routes exist
- [x] Added Android runtime render recovery for intermittent black/white screens:
  - `MainActivity.onResume()` resumes WebView timers, invalidates the WebView, and calls `window.__isoAndroidForceRepaint`.
  - `android-bridge.js` dispatches `isotope:android-resume`, installs Android-gated render recovery CSS, and reloads only if the React root is truly blank.
  - `AppTheme.NoActionBarLaunch` now declares `postSplashScreenTheme`; app theme uses a stable dark `windowBackground`.
- [x] Added Android-gated Analytics stability patches:
  - disables Sentry/replay startup on Android
  - forces chart reduce-motion/performance mode on Android
  - disables AnalyticsPeriod chart animation on Android
  - caps rendered Session Log rows to 120 on Android while preserving source data
  - prevents Monthly/Weekly next navigation from going past the current period
- [x] Repaired profile/onboarding cloud merge:
  - `handlePostProfile()` reads existing `profile_data`, deep-merges partial updates, and upserts the merged row.
  - Completed profile saves persist `user_onboarding.completed=true` via verified upsert without wiping academics.
- [x] Added Android Storage bucket bridge helpers for `group-icons` and `study-material`.
- [x] Applied live Supabase migration files for Android storage buckets and community API grants in project `vteqquoqvksshmfhuepu`.
- [x] Applied live Supabase migration for invite RPC slug contract in project `vteqquoqvksshmfhuepu`.
- [x] Added Android community bundle patch:
  - removes stale community premium wrappers
  - forces community/group/leaderboard hooks to run instead of disabling on stale local premium flags
  - adds a visible `Join with Code` action to group discovery
  - fixes the bad group category label `shit` to `Other`
- [x] Updated app-only UX patches:
  - Headway account changed to `7eeYY7`.
  - Android browser-storage warning is suppressed.
  - Dashboard feedback link targets `https://isotopeaiapp.featurebase.app/`.
  - Notification panel is bounded and scrollable on Android.
- [x] `npm test` passes 43 Node tests.
- [x] `npm run build` passes: `prepare-www`, required patching, `npx cap sync android`, final idempotent patch pass.
- [x] `git diff --check` passes.
- [x] GitHub Actions build for commit `cbe98ac` passed.
- [ ] GitHub Actions build for the current local community patch is pending push.
- [x] Downloaded and extracted artifact `IsotopeAI-debug-46` using `GITHUB_PAT` from `.env`.
- [x] Statically inspected the APK:
  - `app-debug.apk` size: 56,024,656 bytes.
  - Package: `in.isotopeai.app`.
  - compileSdk/targetSdk: 35.
  - Real UI assets present: `App-pJGjDiPw.js`, `Analytics-D74gQMjN.js`, `AnalyticsPeriod-CGXbfYQB.js`, `DashboardHeader-DNuRMna8.js`, `HeadwayUpdatesButton-DUh668tJ.js`.
  - Bridge assets present: `android-bridge.js`, `android-floating-timer-bridge.js`, `sync/backup-normalizer.js`, `sync/local-data-adapter.js`.
  - Markers found in APK: `__isoAndroidForceRepaint`, `persistCompletedOnboardingIfNeeded`, `__androidStable`, `h.slice(0,120)`, Headway account `7eeYY7`, Featurebase app link, Android Sentry startup skip.
  - Permissions found: notification, overlay, foreground service, exact alarm, network state.
  - Temporary artifact directory `.artifact-tmp/` deleted after inspection.

## Important Test Scope

- Code written: YES.
- Unit/patch-contract tested: YES, 43 Node tests.
- Local Capacitor sync/build script: YES, `npm run build`.
- Local Gradle/APK build: SKIPPED by user instruction. Use GitHub Actions only.
- CI APK build: PASS for commit `8f5cb1f`, GitHub Actions run `28516820643`.
- Debug artifact: `IsotopeAI-debug-46`, artifact id `8009649602`.
- Artifact ZIP download from this shell: PASS using `GITHUB_PAT` from `.env`; extracted and statically inspected, then deleted from local storage.
- Emulator tested: NOT YET.
- Physical-device tested: NOT YET.

## Current User-Reported Runtime Defects To Verify Next

- App appears disconnected from Supabase beyond login/info.
- Cloud sync/import/export/backup decisions may still fail at runtime until the new bridge is in a GitHub-built APK.
- Focus/Analytics pages intermittently show a full black screen; code-level Android render recovery is written and locally tested, but not device-verified.
- PNG logo looks wrong in dark mode.

## Npm Audit

- `npm audit --omit=optional` still reports 2 high-severity dev-only issues through `@capacitor/cli@6.2.1`:
  - `tar@6.2.1`
  - `glob@9.3.5`
- `npm explain tar` and `npm explain glob` show both come through `@capacitor/cli@6.2.1`.
- Available remediation requires `npm audit fix --force`, upgrading Capacitor CLI to `8.4.1`. That is a separate major migration and was not mixed into this repair.

## Not Yet Verified

- Runtime login/dashboard/onboarding with the next APK.
- Runtime cloud sync, import/export, backup restore, and storage cleanup.
- Empty local state cannot overwrite rich cloud data in the packaged APK.
- Community/leaderboards/session sync in the packaged APK.
- Focus/Analytics intermittent black-screen bug.
- Dark-mode logo appearance.
- OnePlus Pad Go Floating Timer acceptance list.
- Responsive phone/tablet/orientation matrix.

## Next Commands

```bash
export GITHUB_PAT=...
curl -L -H "Authorization: Bearer $GITHUB_PAT" -o /tmp/isotope-a99d575.zip https://api.github.com/repos/Suydev/isotope-apk/actions/artifacts/7996534384/zip
unzip /tmp/isotope-a99d575.zip -d /tmp/isotope-a99d575
```
