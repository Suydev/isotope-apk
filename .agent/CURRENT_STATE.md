# IsotopeAI Android — Current State

**Updated:** 2026-08-22 (session 8)
**Branch:** main · **Last commit:** 358e85a (v3.5.0.2) + UNCOMMITTED work in tree
**Tests:** 57 pass / 0 fail · **Syntax gate:** ALL www JS PASS

---

## Session 8 (2026-08-22) — completed

### OAuth / Google sign-in chain (end-to-end wired)
1. `useAuthStore-Aw1au7RF.js` — VERIFIED all anchors: `autoRefreshToken:!0`,
   `isPremium:()=>!0`, `planType:"ranker"`, isotope-auth-token mirror,
   `redirectTo:"https://localhost:6767/oauth-return"` baked.
2. `MainActivity.java` — CRITICAL FIX: deep-link handler now preserves the URI
   **fragment** (`#access_token=...`) when relaying `isotopeai://auth/callback`
   into the WebView. Previously tokens were dropped → Google sign-in failed silently.
3. `PipHttpServer.java` — `/oauth-return` relay page forwards hash → deep link,
   then POSTs `/__oauth/consumed`; endpoint then STOPS relaying (serves static
   "Signed in" page). Added pause/resume/togglePause to allowed floating-timer
   actions (parity with server.mjs PIP_ALLOWED_ACTIONS).
4. **Google Console redirect URI answer:** Web application client, authorized
   redirect = `https://ollsqiutzartjhiuzkbf.supabase.co/auth/v1/callback` (Google side);
   Supabase Auth allow-list must include `https://localhost:6767/**`.
   No Android-type client needed.

### Community backend gaps closed (android-bridge.js)
- `handleCommunityHeartbeat` was dead code → now routed in edge-function dispatcher.
- `handleGetGroupAnalytics` zero-stubs replaced with real computation (port of
  server.mjs group-analytics branch): group_streak, members_active_today,
  avg_session_minutes, total_sessions, top_contributor (+ members enrichment)
  from group_members + user_stats_summary + daily_user_stats + users.
- Known remaining gap (low): currentUserRank null on RPC edge-fn leaderboard
  variants; `/__leaderboard` path already computes it.
- Chat transport verified: legacy bundle polls RPC every 8s (works via bridge);
  newer bundles use Supabase Realtime WebSocket (bypasses fetch bridge, works natively).

### Community black-screen fix
- Root cause (high confidence): stale SW from old installs serves v3.3.9 bundles
  mixed with new → dual React contexts → crash.
- Fix: android-bridge.js now unregisters ALL service workers + purges
  isotope/workbox/runtime/precache caches at boot, once per APP_VERSION
  (localStorage key `iso-sw-purged-version`).

### Tablet behaves like PC ("smart resolution file")
- NEW `www/iso-screen.js` (loaded in index.html right after android-bridge.js):
  - On Android app with real viewport ≥640 CSS px, reports ≥1280 to JS.
  - Overrides `window.innerWidth` getter + wraps `matchMedia` width queries.
  - CSS/vw untouched (dialog media queries still per-real-screen).
  - Fixes: Sidebar `innerWidth<1024` mobile-nav on tablet, Study `>=1280`
    desktop gate, Tasks matchMedia(639px), ToolsModal/SessionEdit/Analytics checks.

### Focus video background self-heal (focus-bg-import.js)
- Dead blob: URLs (revoked across SPA remounts) no longer show "could not play".
- `vid.onerror`: if blob URL → re-read blob from IDB → fresh objectURL → retry once.
- `ensureActiveBackground()` liveness check: dead video element or detached target
  forces re-apply instead of skip.
- Note: upstream focusBackground-Dc8Rc9XQ.js validator strips blob/data URLs at
  persist time — irrelevant now because OUR layer stores blobs in its own IDB key.

### restore-and-launch.js syntax fix
- Unclosed `if (!__isoOAuthReturn) {` block (line ~873) broke whole boot script
  parse → would white-screen every launch. Fixed + gate-passed.

---

## Pending / queued
- **Proof screenshots review:** ~/storage/downloads/proof/ (4 jpgs, black screen
  evidence from 08-21). Skip Record mp4 + focus folder. SCHEDULED BY USER.
- Commit + push all uncommitted work → CI APK build (needs user approval).
- Device sweep after build: login persistence, community full pass, sync verify,
  Google sign-in E2E, notifications, battery card, scroll.
- Supabase allow-list verify: confirm `https://localhost:6767/**` present in
  redirect URLs (user says done; not independently verified this session).

## PiP decision status
- In-app native FloatingTimerService remains primary overlay (DEC stands).
- PipHttpServer :3000 keeps full pipapk protocol parity (state/action/health),
  so external pipapk still works if ever needed; actions replay into WebView
  via __ISO_FLOATING_TIMER__.handleNativeAction queue.
