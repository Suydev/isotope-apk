# AGENTS.md — isotope-apk

**Version:** 3.5.0 · **Updated:** 2026-08-21 · **Branch:** main

Android APK (Capacitor 6) for IsotopeAI. Ships the compiled web app in `www/` with a
JS bridge (`www/android-bridge.js`) that replaces every server endpoint the web app's
`server.mjs` would normally provide. **No runtime Node server inside the APK.**

---

## Architecture: Baked Patches (the only allowed approach)

The upstream web app (`isotope-code`) patches bundles at **serve time** via ~21
`getPatched*Bundle()` functions in `server.mjs`. The APK cannot run that server, so
all patches are **baked into the committed `www/assets/` files**.

### How to re-sync patches from upstream
1. Start the upstream server with our Supabase env:
   ```bash
   cd ~/isotope-code && SUPABASE_URL=https://ollsqiutzartjhiuzkbf.supabase.co \
     SUPABASE_ANON_KEY=<anon from supabase.config.json> PORT=3399 setsid node server.mjs &
   ```
2. Fetch every `/assets/*` it serves and overlay onto `www/assets/`
   (only files whose names exist in `isotope-code/public/assets/`; never delete
   APK-only files like old v3.3.9 chunks).
3. **Guard rails after every capture:**
   - `grep -rl "FILE IDENTITY" www/assets/` → must be empty (upstream ships one
     garbage placeholder: `analyticsWorker-Dpw5jo6o.js`; restore ours from git).
   - `node --check` every touched bundle.
   - Verify key anchors survive (see checklist below).
4. Commit. CI builds the APK on every push to main.

### NEVER do
- ❌ Re-create `scripts/apply-android-patches.js` (deleted permanently — corrupted bundles once).
- ❌ Embed a Node server in the APK (rejected: heavy, fragile; bridge already covers endpoints).
- ❌ Regex-replace plan fields in responses without the `isPlanObject` guard (corrupts domain objects).

---

## Patch anchor checklist (verify after any capture)

| Bundle | Anchor | Meaning |
|---|---|---|
| useAuthStore-Aw1au7RF | `if(a==="isotope-auth-token"){try{const l=localStorage.getItem` | session mirrored to plain localStorage (**login persistence**) |
| useAuthStore-Aw1au7RF | `autoRefreshToken:!0` | sessions auto-refresh (**no hourly logout**) |
| useAuthStore-Aw1au7RF | `isPremium:()=>!0` + `planType:"ranker"` | premium unlocked |
| communityApi-Ccw5N_9O | `const s=()=>!1;` | demo gate off → real RPCs |
| communityApi-Ccw5N_9O | `getGroupMessages` + `getLeaderboard` + `/__leaderboard` | chat + leaderboard methods |
| Community-CEnEgsrd | `(h.group.subjects||[])` etc. | null-safety crash guards |
| index-D1Y5F8Lk | no `ingest.us.sentry.io` | Sentry disabled |
| Focus-B4gLsWoP | NO `window.__pipBridge=` | dead HTTP PiP bridge stripped (native PiP instead) |
| Auth-D0Y8CB1f | `__isoLogin` / `__isoUp` | auth routed through bridge |
| sessionSync-mloIEnTd | `remains pending` | sync failures queue, never fake-success |
| useInvites-D9RLFwf8 | `p_code` | invite RPC param rename |

---

## Bridge endpoint map (`www/android-bridge.js`)

Full parity with `server.mjs`. Intercepts `window.fetch`:

- **Auth:** `/__auth/login|signup|check|logout|bootstrap|profile(GET/POST)|snapshot|
  backup(POST)|backup/latest|backup/best|restore-best-backup|import|
  storage/group-icon|storage/study-material|storage/cleanup-preview|storage/cleanup-apply|
  onboarding-complete`
- **Community:** `/__leaderboard` (POST; global/daily/group from stats tables w/ user JWT),
  `/__supa/functions/v1/{finish-session,get-leaderboard,get-daily-leaderboard,
  get-group-leaderboard,get-group-analytics,community_heartbeat}`.
  All other `community_*` RPCs pass through directly to Supabase REST with user JWT.
- **Local:** `/api/version`, `/api/check-update`, `/api/health`, `/api/ai-config`,
  `/api/restart`, `/__isotope/ping`, `/__isotope/state` (GET+POST), `/__errors` (POST),
  `/api/community-events` (404 parity), avatar proxy.
- **Response patcher:** all Supabase JSON responses deep-patched with `isPlanObject`
  guard → `plan_type/effective_plan/access_source='ranker'`, `billing_status='active'`,
  expiry dates 2099 (port of PREMIUM_SCRIPT `patchResp`).
- **Ranker upgrade:** `upgradeProfileToRanker()` PATCHes `users`/`profiles` on bootstrap
  so server-side RLS passes.
- **Session persistence:** login/OAuth write localStorage **and** Capacitor Filesystem
  (`isotope_session.json`, Data dir); `getSession()` falls back to file if localStorage
  is empty (survives process death). Belt-and-suspenders on top of the baked
  vs-adapter mirror + `autoRefreshToken`.

## Supabase project

- Ref `ollsqiutzartjhiuzkbf` · config in `supabase.config.json` (+ `.env`)
- All 31 `community_*` RPCs verified present (incl. chat:
  `community_get_group_messages`, `community_send_group_message`).
- Migrations live in `supabase/*.sql` (009–014 applied; RLS recursion fixed in 011).

## Google Sign-In status

- Flow = Supabase OAuth redirect (`/auth/v1/oauth/google`) → needs **Web-type**
  OAuth client ID+Secret configured in Supabase Auth providers (Management API or
  dashboard). Redirect URI for the Google Console client:
  `https://ollsqiutzartjhiuzkbf.supabase.co/auth/v1/callback`.
- Android-type keys NOT required (no native Credential Manager).

## PiP decision (DEC)

Native `FloatingTimerService` (overlay) + system PiP via MainActivity is the only PiP.
Upstream's `pipapk` requires a localhost Node server — incompatible. The captured
Focus bundle's `__pipBridge` HTTP relay is stripped.

## Build & release

- Push to `main` → GitHub Actions `android.yml`: npm test → cap sync → `node --check`
  gate over all www JS → assembleDebug → artifact `IsotopeAI-debug-<run>`.
- Version: bump `package.json`, `android/app/build.gradle` VERSION_NAME,
  `www/android-bridge.js` APP_VERSION together. versionCode auto-computes
  (major*10000+minor*100+patch).
- Install/test loop: `gh run watch` → download artifact → `adb install -r` →
  logcat + UI sweep.

## Testing

- `npm test` locally (Node test runner, `test/*.test.mjs`).
- Syntax gate: `find www -name '*.js' -not -path '*/node_modules/*' | xargs -n1 node --check`.
- Device: ADB wireless (`adb connect <ip>:<port>`); logcat tag filters
  `IsotopeAI|IsotopeAndroidRuntime|chromium.*ERROR`.

## Key docs

- `.agent/CURRENT_STATE.md` — session log & verified work
- `.agent/NEXT_TASKS.md` — task queue (ANDROID-012…017)
- `.agent/TEST_STATUS.md` — evidence table
