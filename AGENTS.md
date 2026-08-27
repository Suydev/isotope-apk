# AGENTS.md — isotope-apk

**Version:** see `package.json` (single source of truth) · **Updated:** 2026-08-27 · **Branch:** main

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

## Patch anchor checklist (now automated — `test/baked-patches.test.mjs`)

Do **not** verify these by hand; `npm test` asserts every row, and additionally
asserts each bundle is reachable from `index.html`'s entry script.

| Bundle | Anchor | Meaning |
|---|---|---|
| useAuthStore-Aw1au7RF | `if(a==="isotope-auth-token"){try{const l=localStorage.getItem` | session mirrored to plain localStorage (**login persistence**) |
| useAuthStore-Aw1au7RF | `autoRefreshToken:!0` | sessions auto-refresh (**no hourly logout**) |
| useAuthStore-Aw1au7RF | `isPremium:()=>!0` + `planType:"ranker"` | premium unlocked |
| useAuthStore-Aw1au7RF | `__isoOAuthPatched` | `signInWithOAuth` honours caller `redirectTo` + native browser handoff |
| communityApi-Ccw5N_9O | `const s=()=>!1;` | demo gate off → real RPCs |
| communityApi-Ccw5N_9O | `getGroupMessages` + `getLeaderboard` + `/__leaderboard` | chat + leaderboard methods |
| communityApi-Ccw5N_9O | `community_preview_invite` + `community_redeem_invite` + `p_token` | **the live invite path** |
| Community-CEnEgsrd | `(h.group.subjects||[])` etc. | null-safety crash guards |
| index-D1Y5F8Lk | no `ingest.us.sentry.io` | Sentry disabled |
| Focus-B4gLsWoP | NO `window.__pipBridge=` | dead HTTP PiP bridge stripped (native PiP instead) |
| Auth-D0Y8CB1f | `__isoLogin` / `__isoUp` | auth routed through bridge |

### ⚠️ `www/assets` contains 40 ORPHANED bundles (3.3 MB)

Only **122 of 162** JS bundles are reachable from the entry script. The rest are
leftovers from earlier builds — same module names, different content hashes.
Run `node scripts/www-graph.mjs --list-orphans` to see them.

This matters because an anchor checked in an orphaned bundle is a false
assurance. Two rows of this table used to be exactly that:

- `sessionSync-mloIEnTd` (`remains pending`) — orphaned; `finish_session_sync`
  and `sessionSync` appear **nowhere** in the live graph.
- `useInvites-D9RLFwf8` (`p_code`) — orphaned. The live invite path is
  `communityApi` → `community_preview_invite` / `community_redeem_invite` with
  **`p_token`**. Both param spellings exist as real RPCs on the project
  (`accept_invite(p_code)` too), so sending the wrong one fails at runtime, not
  at build time. The bridge still handles `accept_invite`/`get_invite_details`
  for the `p_code` path — harmless, but nothing currently calls it.

Before trusting any bundle-name assertion, check reachability first.

---

## Bridge endpoint map (`www/android-bridge.js`)

Intercepts `window.fetch`. Verified 2026-08-27 against all 64 `server.mjs`
endpoints: **38 are implemented, 26 are absent, and none of the 26 are called by
any reachable bundle** — so parity is functionally complete and implementing them
would be dead code. The absent set, with why:

| Absent | Why it does not matter |
|---|---|
| `/__admin/*` (19 routes) | owner-only tooling behind `ENABLE_ADMIN_MODE`, never shipped to users |
| `/__ai` | the app calls `generativelanguage.googleapis.com` / `api.groq.com` directly |
| `/__supa/functions/v1/create_checkout`, `create_customer_portal_session`, `redeem_membership_code` | Stripe billing; irrelevant because the bridge force-unlocks `plan_type: ranker` |
| `/api/update-now`, `/api/update-status` | web self-updater; `prepare-www.js` strips `update-checker.js` from the APK |
| `/__supa/storage/v1/object/public/avatars/` | the avatar proxy is served under a different bridge path |

Re-run the check after any capture:
`node -e` over `scripts/www-graph.mjs` + a grep of `server.mjs` route literals.

### Implemented

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
- **Session persistence:** all login paths write through `persistSession()`, which
  updates localStorage **and** the Capacitor Filesystem mirror (`isotope_session.json`,
  Data dir). Because `Filesystem.readFile` is async, the file is read via
  `primeSessionFileCache()` and served from an in-memory cache by the synchronous
  `readSessionFromFile()`. Belt-and-suspenders on top of the baked vs-adapter mirror
  + `autoRefreshToken`. Details in the "Auth pipeline" section.

## Supabase project

- Ref `ollsqiutzartjhiuzkbf` · config in `supabase.config.json` (+ `.env`).
  Keys are shared with `isotope-code`'s `.env` (same project, same anon key —
  verified by hash on 2026-08-27). `app-config.json` was a stale duplicate of this
  and has been deleted; do not re-add it.
- Migrations live in `supabase/*.sql` only (009–018; RLS recursion fixed in 011).
  Root-level copies were removed — do not re-add them.
- 30 `community_*` RPCs verified live against the prod project on 2026-08-27
  (incl. chat: `community_get_group_messages`, `community_send_group_message`).
  The compiled `communityApi` bundle's call signatures match the deployed ones, so
  Community breakage is an auth/session problem, not a schema mismatch.

## Google Sign-In status

- Flow = Supabase OAuth redirect (`/auth/v1/oauth/google`) → needs **Web-type**
  OAuth client ID+Secret configured in Supabase Auth providers (Management API or
  dashboard). Redirect URI for the Google Console client:
  `https://ollsqiutzartjhiuzkbf.supabase.co/auth/v1/callback`.
- Android-type keys NOT required (no native Credential Manager).
- Supabase Auth → URL Configuration → Redirect URLs must include
  `isotopeai://auth/callback` **and** `http://localhost:6767/callback`, otherwise
  Supabase refuses the redirect and the browser never returns to the app.
  **Both are configured and verified as of 2026-08-27** — `/auth/v1/authorize`
  302s to `accounts.google.com` for each, and Google accepts the client
  (`726908208904-…apps.googleusercontent.com`, Web type, callback
  `https://<ref>.supabase.co/auth/v1/callback`).
- Supabase returns `response_type=code` with **no** `code_challenge`, i.e. the
  plain authorization-code flow, not PKCE. The bridge's OAuth handler covers both
  the `#access_token=…` fragment and the `?code=…` exchange.
- See the "Auth pipeline" section below for the full in-app flow.

## PiP decision (DEC)

Native `FloatingTimerService` (overlay) + system PiP via MainActivity is the only PiP.
Upstream's `pipapk` requires a localhost Node server — incompatible. The captured
Focus bundle's `__pipBridge` HTTP relay is stripped.

## Build & release

- Push to `main` → GitHub Actions `android.yml`: bridge parity gate → npm test →
  cap sync → `node --check` gate over all www JS → assembleDebug → artifact
  `IsotopeAI-debug-<run>`. `release.yml` handles tags/releases. There is no
  second debug workflow — `android-build.yml` was deleted (it duplicated this one).
- **Version: bump `package.json` only.** `android/app/build.gradle` reads it (and
  derives versionCode as major*10000+minor*100+patch), and `scripts/prepare-www.js`
  rewrites `APP_VERSION` in `www/android-bridge.js` plus `__ISO_APP_VERSION__` in
  `www/index.html`. Do not hardcode versions anywhere else — five files had drifted
  to three different values before this was centralised.
- **`android-bridge.js` source of truth is the ROOT copy.** `prepare-www.js` copies
  root → `www/`. Both copies are committed and CI fails if they differ, so edit the
  root file and copy it into `www/` (or run `npm run prepare-www`) before committing.
- Install/test loop: `gh run watch` → download artifact → `adb install -r` →
  logcat + UI sweep.

## Auth pipeline (rebuilt 2026-08-27 — see .agent/KNOWN_ISSUES.md ISSUE-031…036)

- **Google sign-in runs in the system browser**, never the WebView (Google returns
  `disallowed_useragent` for embedded WebViews). Flow:
  `signInWithGoogle` → patched `AuthService.signInWithOAuth` (`/*__isoOAuthPatched*/`
  in `useAuthStore-Aw1au7RF.js`, honours caller `redirectTo` + `skipBrowserRedirect`)
  → `window.__isoOpenOAuthUrl(url)` → `IsotopeAndroid.openExternalUrl` → browser →
  `isotopeai://auth/callback#access_token=…` → `MainActivity.deliverOAuthPayload`
  (base64, 12 retries for the cold-start race) → `window.__isoHandleOAuthDeepLink`.
- `__isoOpenOAuthUrl` is defined **only** when the native opener exists — the app
  keys `skipBrowserRedirect` off `typeof … === 'function'`.
- Supabase dashboard must allow both redirect URLs: `isotopeai://auth/callback` and
  `http://localhost:6767/callback` (the latter is served by `PipHttpServer`).
- **One session writer:** `persistSession()` (exposed as `window.__isoPersistSession`).
  Every login path — password, signup inline session, OAuth fragment, PKCE, refresh —
  goes through it. Do not write auth localStorage keys directly.
- **Token refresh:** `refreshStoredSessionIfNeeded()` is single-flight. Refresh-token
  rotation is currently **off** on this project (10s reuse interval), so parallel
  exchanges are survivable today — but turning rotation on would make them
  invalidate each other and hard-log-out users, so keep the guard. Community RPC
  passthrough refreshes + retries once on 401.
- **Access tokens last 7 days** (`jwt_exp` = 604800), which is why the missing
  refresh helper took so long to surface as "Community broke".
- **Filesystem mirror is async.** Use `primeSessionFileCache()` (async, validates
  before trusting) then the sync `readSessionFromFile()`. `Filesystem.readFile`
  returns a Promise — reading `.data` off it directly is the bug that made the
  "survives process death" fallback a no-op.
- **Auth errors** go through `authErrorMessage()` / `networkErrorMessage()`. Never
  call `r.json()` on an auth response without reading `text()` first; a gateway HTML
  page otherwise surfaces "Unexpected token <" into the login form.

## Crash recovery

A render error in any tab empties `#root` and used to be unrecoverable until
force-stop. `setupAndroidRenderRecovery()` now watches `error`,
`unhandledrejection`, and `popstate`, and on a confirmed blank root navigates to
`/dashboard` (capped at 3 attempts). This is a safety net — each recovery logs
`[IsotopeAndroidRuntime] blank #root after <reason> on <route>` to Logcat, which is
how you find the tab that actually needs fixing.

## Testing

- `npm test` locally (Node test runner, `test/*.test.mjs`).
- Syntax gate: `find www -name '*.js' -not -path '*/node_modules/*' | xargs -n1 node --check`.
- Device: ADB wireless (`adb connect <ip>:<port>`); logcat tag filters
  `IsotopeAI|IsotopeAndroidRuntime|chromium.*ERROR`.

## Key docs

- `.agent/CURRENT_STATE.md` — session log & verified work
- `.agent/NEXT_TASKS.md` — task queue (ANDROID-012…017)
- `.agent/TEST_STATUS.md` — evidence table
