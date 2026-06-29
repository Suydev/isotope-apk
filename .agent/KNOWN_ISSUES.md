# IsotopeAI Android — Known Issues

---

## ISSUE-001 — Bootstrap response missing restore_recommended field
**Severity:** HIGH
**Status:** FIXED (2026-06-29)

**Symptom:**
AppAccessGate expects `/__auth/bootstrap` to return:
```json
{
  "ok": true,
  "best_backup": { ... },
  "backup_candidates": [],
  "restore_recommended": true,
  "backup_warning": null
}
```
Current android-bridge.js `handleBootstrap()` only returns `{ ok, session, profile }` — missing `best_backup`, `backup_candidates`, `restore_recommended`, `backup_warning`.

**Impact:** New-device restore flow may not trigger automatically. User may not see the "Restore from cloud" prompt.

**Reproduction:**
1. Fresh install (no local data)
2. Log in
3. Observe: data from previous sessions not restored automatically

**Suspected cause:** handleBootstrap() in android-bridge.js was simplified vs full server.mjs implementation.

**Fix needed:**
In `android-bridge.js` `handleBootstrap()`:
1. After getting profile, also call `handleGetBestBackup()`
2. Include its result as `best_backup` in the response
3. Set `restore_recommended: true` if best backup is "rich"

**Attempts:** None yet (issue identified during subagent analysis)

---

## ISSUE-002 — WAV sound files = 43.8MB of APK size
**Severity:** MEDIUM
**Status:** OPEN

**Symptom:**
Three ambient sound files: rain.wav (14.8MB), wind.wav (17.1MB), crickets.wav (11.9MB).
Total: 43.8MB. Makes APK too large for Play Store guidelines (warn at 100MB).

**Reproduction:**
```bash
node scripts/prepare-www.js
du -sh www/sounds/
```

**Fix:**
```bash
# In CI (GitHub Actions):
apt-get install -y ffmpeg
ffmpeg -i rain.wav -c:a libvorbis -q:a 4 rain.ogg
# etc.
```

**Blocked by:** ffmpeg not in current CI environment
**Next attempt:** Add ffmpeg step to android.yml, update prepare-www.js

---

## ISSUE-003 — apply-android-patches.js patch strings unverified
**Severity:** MEDIUM
**Status:** OPEN

**Symptom:**
Patch strings in `scripts/apply-android-patches.js` were written based on subagent analysis of minified bundle content. They have NOT been tested against the actual files (require a CI build to verify).

**Reproduction:**
After first CI build, check for "WARNING: Required patch target not found" in build logs.

**Suspected cause:** Minification is not deterministic — patch strings may differ from actual bundle content.

**Fix:** Run CI build, check patch warnings in output, adjust strings as needed.

---

## ISSUE-004 — GitHub Actions: isotope-code repo access
**Severity:** HIGH (BLOCKING for CI)
**Status:** UNKNOWN

**Symptom:**
The `.github/workflows/android.yml` workflow checkouts `Suydev/isotope-code` using `github.token`. If isotope-code is private, this will fail.

**Reproduction:**
Push to GitHub, check Actions run logs for:
`Error: Repository Suydev/isotope-code: Checkout failed`

**Fix options:**
1. Make isotope-code public (simplest)
2. Add PAT with repo access as GitHub Secret `CROSS_REPO_PAT`
3. Update workflow: `token: ${{ secrets.CROSS_REPO_PAT }}`

---

## ISSUE-005 — sessionSync pending queue uses sessionStorage (not persisted through process death)
**Severity:** MEDIUM
**Status:** PARTIALLY MITIGATED

**Symptom:**
The sessionSync bundle may use `sessionStorage` for the pending session queue (`isotope:pending_session_sync`). When Android kills the WebView process, sessionStorage is cleared, losing unsynced session records.

**apply-android-patches.js** includes patches to change `sessionStorage` → `localStorage` for this key, but the patch strings are unverified.

**Reproduction:**
1. Complete a focus session
2. Force-close the app before sync
3. Restart app
4. Check if session appeared in analytics (it shouldn't if lost)

**Fix:** Verify patch strings in Issue-003 fix. If sessionSync uses a different key/pattern, update apply-android-patches.js.

---

## ISSUE-006 — Supabase Realtime (community features) not tested
**Severity:** LOW
**Status:** OPEN (by design)

**Symptom:**
Community features (group chat, presence, leaderboard) use Supabase Realtime WebSocket connections. These should work in Capacitor WebView but have not been tested.

**Reproduction:**
1. Open /community route in app
2. Check if WebSocket connects
3. Check Logcat for WebSocket errors

**Expected behavior:** Community features show "offline" state when WebSocket unavailable, work when connected. AppAccessGate blocks `/community` route entirely when offline.

---

## ISSUE-007 — __ISO_SUPPRESS_UPDATE_CHECK__ may not stop update-checker.js
**Severity:** LOW
**Status:** OPEN

**Symptom:**
update-checker.js polls GitHub API for updates. android-bridge.js sets `window.__ISO_SUPPRESS_UPDATE_CHECK__ = true` and prepare-www.js comments out the script tag. However, if update-checker.js runs before the bridge somehow, it may try to reach GitHub API.

**Fix in prepare-www.js:** Script tag is commented out — this should be sufficient.
