# IsotopeAI Android — Current State

**Updated:** 2026-06-30T23:42:36Z
**Branch:** codex/android-production-repair
**Current phase:** ANDROID-012 — Android Supabase sync/community repair after Floating Timer pass

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
- [x] `npm test` passes 33 Node tests.
- [x] `npm run build` passes: `prepare-www`, required patching, `npx cap sync android`, final idempotent patch pass.
- [x] `git diff --check` passes.

## Important Test Scope

- Code written: YES.
- Unit/patch-contract tested: YES, 33 Node tests.
- Local Capacitor sync/build script: YES, `npm run build`.
- Local Gradle/APK build: SKIPPED by user instruction. Use GitHub Actions only.
- CI APK build for current commit: PENDING until commit is pushed.
- Emulator tested: NOT YET.
- Physical-device tested: NOT YET.

## Current User-Reported Runtime Defects To Verify Next

- App appears disconnected from Supabase beyond login/info.
- Cloud sync/import/export/backup decisions may still fail at runtime until the new bridge is in a GitHub-built APK.
- Focus page intermittently does not open and sometimes shows a full black screen.
- PNG logo looks wrong in dark mode.

## Npm Audit

- `npm audit --omit=optional` still reports 2 high-severity dev-only issues through `@capacitor/cli@6.2.1`:
  - `tar@6.2.1`
  - `glob@9.3.5`
- `npm explain tar` and `npm explain glob` show both come through `@capacitor/cli@6.2.1`.
- Available remediation requires `npm audit fix --force`, upgrading Capacitor CLI to `8.4.1`. That is a separate major migration and was not mixed into this repair.

## Not Yet Verified

- GitHub Actions debug APK build for this combined Floating Timer + Supabase sync repair.
- Download/extract static inspection of the new APK artifact.
- Runtime login/dashboard/onboarding with the new APK.
- Runtime cloud sync, import/export, backup restore, and storage cleanup.
- Empty local state cannot overwrite rich cloud data in the packaged APK.
- Community/leaderboards/session sync in the packaged APK.
- Focus page intermittent black-screen bug.
- Dark-mode logo appearance.
- OnePlus Pad Go Floating Timer acceptance list.
- Responsive phone/tablet/orientation matrix.

## Next Commands

```bash
npm run agent:handoff
git add .github/workflows/android.yml android-bridge.js android-floating-timer-bridge.js android-pip-bridge.js android/app android/build.gradle android/capacitor.settings.gradle android/gradle/wrapper/gradle-wrapper.properties capacitor.config.json package.json package-lock.json scripts/apply-android-patches.js scripts/prepare-www.js test .agent
git commit -m "fix(android): repair sync bridge and floating timer"
git push -u origin codex/android-production-repair
```
