# IsotopeAI Android — Known Issues

---

## ISSUE-040 — Debug log viewer auto-opened over the app
**Severity:** HIGH (UX) — **FIXED IN CODE + UNIT TESTED 2026-08-28**
**Status:** APK RUNTIME UNVERIFIED

A raw developer log dump appeared unprompted during normal use, and a crashed tab
otherwise left a black screen.

**Root cause.** The auto-open heuristic was far too loose:

```js
if(!r || r.children.length<3) return true;              // any sparse page
if(window.__isoLogs.some(x => x.l==='FETCH_ERR' ...))    // one offline blip
```

`root.children.length < 3` matches any route rendering fewer than three
top-level nodes, and a single failed request qualified. A student cannot act on a
log dump — or on `RangeError: Maximum call stack size exceeded`.

**Fix:** replaced with a narrow `bootFailed()` (empty `#root` only, and never
while the splash is up or the notice is already showing), which shows a plain
recovery card instead:

> **Refresh required** — The app needs a refresh. A page bundle failed to load —
> refresh once to pick up the latest app files.

`window.__isoShowRefreshNotice()`. Design decisions, all verified rather than
assumed:
- Contrast measured, not eyeballed: title 16.97:1, body 11.99:1, hint 6.91:1,
  button label 4.67:1. The button uses `#0a0a0b` on brand `#8b5cf6` because
  **white on brand is only 4.23:1 and fails AA.**
- Emerald/amber counter fills on the overlay were likewise moved from -600 to
  -700 (3.77:1 → 5.48:1, 3.19:1 → 5.02:1).
- 48px CTA, `touch-action:manipulation`, scale-0.97 press feedback under 100ms.
- `role="alertdialog"` + `aria-labelledby`/`describedby`; focus moves to the CTA.
- Safe-area padding top and bottom.
- 220ms ease-out enter, transform/opacity only, disabled under
  `prefers-reduced-motion`.
- Inline SVG refresh glyph, not an emoji.
- "Continue anyway" secondary escape, visually subordinate — the notice is
  full-screen, so a failing refresh would otherwise trap the user.
- Refresh calls `__isoClearCachesAndReload()` first, since a plain reload can
  re-serve the exact bundle that failed. **That helper returns `false` and does
  not navigate** when its own 3-reload guard trips, so the result is checked and
  falls back to a hard reload, plus a 4s timeout in case it never settles —
  otherwise the button sat on "Refreshing…" forever.

The log viewer is still reachable on purpose: 3-tap, or `__isoShowLogViewer()`.

**Tests:** 5 — deep-payload survival, shallow patch still applies, notice is
exposed, viewer never auto-opens, and boot-failure detection is narrow. Note the
last assertion strips `//` comments first: it initially failed by matching the
comment *documenting* the old heuristic.

---

## ISSUE-039 — Community: RangeError: Maximum call stack size exceeded
**Severity:** CRITICAL — **FIXED IN CODE + UNIT TESTED 2026-08-28**
**Status:** APK RUNTIME UNVERIFIED

Community crashed with `RangeError: Maximum call stack size exceeded`.

**Root cause.** `isoDeepPatchPlan()` recurses through every Supabase JSON
response to force `plan_type: 'ranker'`. Commit `ddcb799` added a `WeakSet`
"circular guard" — but a `WeakSet` only detects **cycles**. A deep *acyclic*
graph presents a brand-new object at every node, so the set never hits and
recursion continues until the stack dies. Community payloads (groups → members →
profiles → stats) are the deepest in the app, which is why it failed there
specifically. Verified by reproduction:

```
circular          : OK (guarded)
deep acyclic 12k  : RangeError — Maximum call stack size exceeded
```

**Fix:** added a depth cap of 24; past it the subtree is returned untouched.
Nothing rendered needs plan fields 24 levels deep. Both the cycle guard and the
shallow patching still work — asserted by test, not assumed.

---

## ISSUE-037 — PiP button did nothing, silently
**Severity:** HIGH — **FIXED IN CODE + UNIT TESTED 2026-08-27**
**Status:** APK RUNTIME UNVERIFIED

Tapping Picture-in-Picture in Focus appeared to work and produced no window and
no error.

**Root cause — load order + a lying stub.** `android-floating-timer-bridge.js`
loads synchronously from `index.html` (line 85). `Focus-B4gLsWoP.js` is a *lazy*
import that only evaluates on `/focus`, and it ships its own canvas+video PiP
shim guarded by `if('documentPictureInPicture' in window) return`. So the bridge
always wins the property and Focus's shim never installs — whatever the bridge
provides *is* the PiP implementation.

The bridge's `requestWindow()` resolved a **fake window** whose
`document.body.append` and `document.createElement` were no-ops:

```js
return Promise.resolve({ document:{ body:{ append:function(){}, … } } });
```

Focus then built its entire PiP DOM tree into that black hole and reported
success. Same defect in `HTMLVideoElement.prototype.requestPictureInPicture`: it
resolved for *any* discovered controller without entering PiP, which also broke
Focus's own video fallback — the shim believed it had a PiP window while nothing
was on screen.

**Fix (`android-floating-timer-bridge.js`):**
- `requestWindow()` now attempts the native overlay and only claims success if
  `startFloatingTimer` actually ran (permission granted, active session).
- On the native path it returns a **real** detached document
  (`document.implementation.createHTMLDocument`) so Focus's `append` /
  `createElement` work, and `close()` calls `stopFloatingTimer`.
- Focus's own video shim is captured *before* the property is overwritten and
  used as a fallback when the native overlay cannot start.
- With neither available it **rejects** — Focus already alerts on rejection, so
  the user is told something instead of staring at nothing.
- The video-PiP override only diverts when the native overlay genuinely starts;
  otherwise it delegates to the real browser implementation.

**Tests:** 6 new in `test/floating-timer-bridge.test.mjs` — installs the API,
rejects when it cannot start, does not spawn an overlay for an idle timer,
surfaces the overlay-permission prompt, returns a document that can actually be
built into, and tears the overlay down on `close()`.

**Note:** the test harness now unrefs the bridge's two `setInterval`s (1s state
pump, 1.5s controller discovery). Without that the file kept the event loop
alive and `node --test` failed the whole file with
`Promise resolution is still pending` despite every assertion passing.

---

## ISSUE-036 — Any tab crash leaves a permanent black screen
**Severity:** CRITICAL — **FIXED IN CODE + UNIT TESTED 2026-08-27**
**Status:** APK RUNTIME UNVERIFIED

A render error in any route (Tasks, Community, Analytics, …) unmounts the React tree
and leaves an empty `#root`. The only recovery hook was `checkBlankRoot()`, which ran
solely on resume / rotation / focus — so a crash while switching tabs was permanent
until the app was force-stopped.

**Fix:** `setupAndroidRenderRecovery()` in `android-bridge.js` now also listens for
`error`, `unhandledrejection`, and `popstate`, and on a confirmed blank `#root`
navigates to `/dashboard` (a route that does not depend on the crashed data) rather
than reloading the crashing route in place. Capped at 3 recoveries so a crash on
`/dashboard` itself cannot loop. Exposed as `window.__isoRecoverFromTabCrash`.

**Note:** this is a safety net, not a cure. The underlying per-tab crashes still need
individual root-causing; each recovery logs `[IsotopeAndroidRuntime] blank #root after
<reason> on <route>` to Logcat, which identifies the failing route.

---

## ISSUE-035 — `refreshStoredSessionIfNeeded()` called but never defined
**Severity:** CRITICAL — **FIXED IN CODE + UNIT TESTED 2026-08-27**
**Status:** APK RUNTIME UNVERIFIED

`rpcPost()` (`android-bridge.js`) retried 401s by calling
`refreshStoredSessionIfNeeded(session)` — a function that did not exist anywhere in the
file. Every expired-token community/leaderboard RPC therefore threw
`ReferenceError: refreshStoredSessionIfNeeded is not defined` instead of recovering.
This is the direct cause of "Community is fully broken" once a session aged past the
access-token lifetime.

**Fix:** implemented `refreshStoredSessionIfNeeded()` with a single-flight guard
(Supabase rotates refresh tokens, so parallel exchanges invalidate each other and
hard-log-out the user). Community RPC passthrough now refreshes and retries once, then
returns a readable `SESSION_EXPIRED` error instead of a bare 401.

**Tests:** `expired community RPC refreshes the session and retries instead of throwing`,
`community RPC surfaces a readable error when the refresh token is rejected`,
`refresh rotates and persists the new token across all storage keys`,
`concurrent refreshes are coalesced into a single token exchange`.

---

## ISSUE-034 — Google sign-in succeeded in the browser, app stayed logged out
**Severity:** CRITICAL — **FIXED IN CODE + UNIT TESTED 2026-08-27**
**Status:** APK RUNTIME UNVERIFIED

Three independent faults in the OAuth round trip:

1. **App ignored the Android redirect target.** `AuthService.signInWithOAuth()` in
   `useAuthStore-Aw1au7RF.js` hardcoded `redirectTo: ${window.location.origin}/dashboard`
   and dropped the caller's options — so `signInWithGoogle()`'s
   `redirectTo: "isotopeai://auth/callback"` never took effect, and the flow navigated
   the WebView to Google, which rejects embedded WebViews (`disallowed_useragent`).
2. **Callback detection never matched.** The bridge only handled callbacks when
   `protocol === 'http:'` and `pathname` started with `/callback`. Under Capacitor the
   page is served from `https://localhost`, so returning tokens were silently discarded.
3. **Loopback redirect 404'd.** `AndroidManifest.xml` declares an intent filter for
   `http://localhost:6767/callback`, but `PipHttpServer` only served `/oauth-return`.

**Fix:**
- Patched `signInWithOAuth` to honour caller options and hand the authorize URL to
  `window.__isoOpenOAuthUrl()` with `skipBrowserRedirect`, so the system browser runs
  the flow (marked `/*__isoOAuthPatched*/`).
- `__isoOpenOAuthUrl` is defined **only** when the native opener exists, because the app
  keys `skipBrowserRedirect` off `typeof … === 'function'`.
- Added `window.__isoHandleOAuthDeepLink(rawUrl)`; `MainActivity.deliverOAuthPayload()`
  base64-passes the fragment straight to it with up to 12 retries (cold start races the
  WebView), and falls back to `/auth` if the payload is never consumed.
- Callback matching is now path-suffix + scheme agnostic, and listens on `popstate` as
  well as `hashchange`.
- `PipHttpServer` serves `/callback` and `/auth/callback`; `resetOAuthReturn()` clears
  the consumed latch so a second sign-in attempt still forwards its tokens.

**Tests:** `OAuth deep-link handler consumes a token fragment and stores the session`,
`OAuth deep-link handler ignores URLs with no auth payload`,
`bridge advertises the native OAuth redirect target`,
`__isoOpenOAuthUrl is only defined when the native bridge can open URLs`.

**Still required (not code):** the Supabase dashboard must list
`isotopeai://auth/callback` and `http://localhost:6767/callback` under Auth → URL
Configuration → Redirect URLs, and a **Web-type** Google OAuth client must be configured.

---

## ISSUE-033 — Bootstrap rejected valid sessions with `no_user_id`
**Severity:** CRITICAL — **FIXED IN CODE + UNIT TESTED 2026-08-27**
**Status:** APK RUNTIME UNVERIFIED

`/__auth/bootstrap` required `session.user.id`, but the OAuth fragment flow stores
tokens only (no `user`), and `handleSignup` never persisted its inline session at all.
Result: sign-in "worked", then the app bounced straight back to the login screen.

**Fix:** bootstrap now resolves the session asynchronously and self-heals —
localStorage → Filesystem mirror → `refresh_token` exchange if expired →
`/auth/v1/user` lookup if `user` is missing — and writes the resolved user back.
`handleSignup` persists an inline session (deriving `expires_at`) and attaches the user.
All login paths now write through one `persistSession()` function, exposed as
`window.__isoPersistSession` so the separate OAuth IIFE cannot drift from it.

**Tests:** `bootstrap resolves the user id via /auth/v1/user when the session lacks one`,
`bootstrap refreshes an access token that is already expired`,
`signup persists an inline session when email confirmation is disabled`,
`signup still reports email confirmation when no session is returned`.

---

## ISSUE-032 — Filesystem session fallback never worked (async read used synchronously)
**Severity:** HIGH — **FIXED IN CODE + UNIT TESTED 2026-08-27**
**Status:** APK RUNTIME UNVERIFIED

`readSessionFromFile()` called `Capacitor Filesystem.readFile(...)` — which returns a
**Promise** — and then read `result.data` off the Promise object, always `undefined`.
The "survives process death" guarantee in AGENTS.md was therefore never real: any user
whose localStorage was cleared by the WebView was logged out with no recovery.

**Fix:** split into `primeSessionFileCache()` (async, validates the payload before
trusting it, mirrors into localStorage) and a synchronous `readSessionFromFile()` that
reads the in-memory cache. Bootstrap primes the cache when localStorage is empty.
Session shape unwrapping (supabase-js / zustand wrappers) is now one shared
`normalizeSessionShape()` helper.

**Tests:** `getSession unwraps supabase-js and zustand session wrappers`,
`getSession survives a corrupt stored session without throwing`.

---

## ISSUE-031 — Auth errors surfaced raw JSON/parse failures to users
**Severity:** MEDIUM — **FIXED IN CODE + UNIT TESTED 2026-08-27**
**Status:** APK RUNTIME UNVERIFIED

`handleLogin`/`handleSignup` called `r.json()` unconditionally, so a gateway HTML error
page produced `Unexpected token <` in the login form. Supabase's machine strings
(`invalid_grant`) were also shown verbatim.

**Fix:** both handlers read `text()` first and map through new `authErrorMessage()` /
`networkErrorMessage()` helpers (wrong password, unconfirmed email, duplicate account,
weak password, rate limit, offline, timeout). Missing credentials are rejected without a
network call. Responses carry a stable `code` (`LOGIN_FAILED`, `SIGNUP_FAILED`,
`MISSING_CREDENTIALS`, `NETWORK`, `SESSION_EXPIRED`).

**Tests:** `login maps Supabase auth errors to user-facing messages`,
`login does not leak JSON parse errors when the server returns HTML`,
`login rejects missing credentials without a network call`,
`signup maps duplicate-account errors to a readable message`.

---

## ISSUE-030 — WebView "Missing initializer in destructuring declaration" (app never mounts)
**Severity:** CRITICAL — **RESOLVED 2026-08-20**
**Status:** FIXED, verification on phone browser in progress

Exact device error (also reproduced in the phone's browser — Chrome/148 — against a plain
HTTP copy of `www/`):
```
Auth-D0Y8CB1f.js:1 Uncaught SyntaxError: Missing initializer in destructuring declaration
```
**Root cause:** `scripts/apply-android-patches.js` inserted invalid code into six bundles:
- Auth: One Tap exposure patch added `{` without the matching `}` (`if(x){...try{` — brace
  imbalance cascaded to the effect deps array).
- useOnlineStatus: `const c=...` injected inside a `return` expression (`return const c=...`).
- Analytics: `const __androidStable=...;` injected mid-declarator list (inside a
  `J=[...],je=...,...` chain).
- useAuthStore / useNotificationStore / workbox-window: same patch-family corruption.
acorn + esbuild + Node's strict module parser all rejected the outputs; Node 26's tolerant
V8 hid the problem locally, which is why CI `node --check` never caught it.

**Resolution:** script deleted; bundles regenerated from live site + corrected integrations;
Analytics taken clean from isotope-code; CI now gates on module-parse of every www JS file.
Tests: 57 pass / 0 fail; all 141 www JS files parse as modules.

---

## ISSUE-023 — Rotation (portrait↔landscape) leaves WebView permanently black, no recovery
**Severity:** CRITICAL
**Status:** CODE FIX WRITTEN + UNIT TESTED (2026-07-09); APK RUNTIME UNVERIFIED

User reported that rotating the device from portrait to landscape (and back) can turn the
WebView fully black with no way to recover short of a full app reinstall.

**Root cause found:** `AndroidManifest.xml` declares
`configChanges="orientation|screenSize|..."` on `MainActivity`, so Android does **not**
destroy/recreate the Activity on rotation — it calls `onConfigurationChanged` instead. That
method was never overridden, so rotation fired neither the native `onResume` repaint path
nor the JS-side `visibilitychange`/`focus` listeners that `android-bridge.js` already used to
force a WebView repaint. A WebView compositor glitch after resize therefore had zero recovery
hook, matching "no fix until reinstall."

**Current fix:**
- `MainActivity.onConfigurationChanged` now forces `requestLayout()` + `invalidate()` +
  `window.__isoAndroidForceRepaint(...)` twice (immediately and again after a 350ms settle
  delay), mirroring the existing `onResume` recovery path.
- `android-bridge.js` now also listens for JS-level `orientationchange` and debounced `resize`
  events and calls `forceRepaint()` + `checkBlankRoot()` (which force-reloads once if `#root`
  is empty), so recovery no longer depends solely on the native hook firing.

**Evidence:** `npm test` (63/63) unaffected; `npm run build` (prepare-www + apply-patches +
cap sync) completes cleanly with the new hooks present in `www/android-bridge.js`.

**Remaining risk:** Needs a GitHub-built APK and physical-device rotation test (several
rotations in Focus, Analytics, and Community) to confirm the black screen cannot recur.

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
**Status:** CODE FIX WRITTEN + UNIT TESTED; APK RUNTIME UNVERIFIED (2026-06-30)

`BLOCKED_EMPTY_OVERWRITE` must be preserved and verified in the packaged APK. Empty fresh install must never overwrite richer cloud data.

**Current fix:** Android backup upload now scans Supabase Storage candidates, blocks empty local-over-rich cloud writes, writes canonical `backups/latest.json`, `backups/history/*.json`, and `cloud-snapshot/latest.json`, and only runs cleanup after verified upload/readback.

**Evidence:** `npm test` covers empty-over-rich blocking, canonical upload, restore-best-backup payload shape, import archive/promote, and stale archive cleanup.

**Remaining risk:** Needs GitHub-built APK runtime verification against the real Supabase project and Storage RLS.

---

## ISSUE-009 — WAV sound files are large
**Severity:** MEDIUM
**Status:** FIXED (2026-08-14)

`www/sounds/` contained ~41.8 MB of WAV files (rain, wind, crickets) that were **not referenced by any code** — the Focus bundle loads sounds from remote GitHub URLs. WAV files removed entirely.

**Evidence:** Focus bundle `Sn` component uses `url:"https://raw.githubusercontent.com/cookiecaker/Rain-World-Sounds/main/Ambient%20Sounds/..."` — no local file references found.

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
**Status:** CODE FIX WRITTEN + UNIT TESTED; APK RUNTIME UNVERIFIED (2026-06-30)

The compiled `useOnlineStatus` hook read `navigator.onLine`, which is unreliable in the Android WebView context and can leave Settings/cloud sync showing offline or local-only mode while the device is connected.

**Current fix:** `android-bridge.js` now reads Capacitor Network status, overrides the Android `navigator.onLine` getter, exposes `window.__isoIsOnline()`, and dispatches `isotope:network`. `scripts/apply-android-patches.js` patches the compiled `useOnlineStatus` bundle to consume that Android state and event. The bridge also intercepts direct absolute Supabase `/functions/v1/*` calls so Supabase JS client function invocations do not bypass Android's RPC mapping.

**Evidence:** `npm test` includes Android bridge network-state coverage and patch-contract coverage for `useOnlineStatus`.

**Remaining risk:** Needs GitHub-built APK install and online/cloud sync runtime evidence. Supabase RPC/storage failures must still be inspected if cloud sync remains broken after the false-offline fix.

---

## ISSUE-015 — Previous system PiP timer was not interactive
**Severity:** HIGH
**Status:** REPLACED IN CODE + UNIT TESTED; DEVICE UNVERIFIED (2026-06-30)

The previous repair path injected `android-pip-bridge.js`, faked `documentPictureInPicture`, and entered Android system PiP through `MainActivity`. Android system PiP does not allow directly clickable app UI; only system PiP menu actions are available. Therefore the previous "compact timer PiP" could not satisfy the desktop-equivalent interactive timer requirement.

**Current fix:** The old document-PiP shim is removed from packaging. Focus now calls `window.__isoOpenFloatingTimer()` and passes real `useFocusStore` state/actions to `android-floating-timer-bridge.js`. Native Android renders `FloatingTimerService` with `WindowManager`, `TYPE_APPLICATION_OVERLAY`, Display-over-other-apps permission flow, a foreground service notification, transparent outside window, rounded draggable card, and queued actions back to the WebView.

**Evidence:** `npm test` covers bridge packaging, overlay permission denial, tracked/non-tracked question-control behavior, Correct/Incorrect/Skip/Undo/Target dispatch, target bounding, service/overlay native contracts, and queued action replay contracts. `npm run build` passed with idempotent patching.

**Remaining risk:** Needs GitHub-built APK and OnePlus Pad Go runtime evidence. Do not mark runtime Floating Timer done until the overlay is dragged over another app and real counts update from the native controls.

---

## ISSUE-017 — Focus-type emoji corruption
**Severity:** HIGH
**Status:** FIXED IN CODE + UNIT TESTED; DEVICE UNVERIFIED (2026-06-30)

The production profile normalizer used `(icon.trim() || "📌").slice(0, 4)`, which counts UTF-16 code units and can split emoji. It also preserved corrupted stored values such as `����`, U+FFFD, and `ï¿½`, causing Lecture and other focus types to render broken icons.

**Current fix:** Android installs a grapheme-safe icon normalizer before the app bundle loads. The App bundle patch calls it while normalizing focus types. Stored Android profile data is repaired once when corrupted. Built-in invalid icons fall back to canonical values:
`theory=📚`, `questions=❓`, `lecture=🎓`, `revision=📝`, `practice=💪`, `other=📌`.

**Evidence:** `npm test` covers compound emoji, Lecture `����`, U+FFFD, `ï¿½`, valid custom emoji, unpaired surrogates, one-shot persistence, and preservation of canonical/custom focus types.

**Remaining risk:** Needs GitHub-built APK and device verification that Lecture displays `🎓`.

---

## ISSUE-018 — npm audit dev dependency vulnerabilities
**Severity:** MEDIUM
**Status:** BLOCKED WITHOUT CAPACITOR MAJOR UPGRADE (2026-06-30)

`npm audit` reports 2 high-severity dev-only vulnerabilities through `@capacitor/cli@6.2.1`:

- `tar@6.2.1`
- `glob@9.3.5`

**Current finding:** `npm audit fix --dry-run` and `npm audit fix --package-lock-only --dry-run` have no non-force fix. The available fix forces `@capacitor/cli@8.4.1`, a major Capacitor migration that can break native bridge and patch-script behavior.

---

## ISSUE-021 — Analytics Monthly switch can black-screen Android WebView
**Severity:** CRITICAL
**Status:** CODE FIX WRITTEN + UNIT TESTED; APK RUNTIME UNVERIFIED (2026-07-01)

User reported the same black-screen class on Analytics when switching month to view past sessions.

**Current fix:** Android now has a native/WebView resume repaint path, stable dark post-splash theme, Android-gated render recovery CSS, Android Sentry/replay startup suppression, Android chart animation disablement for AnalyticsPeriod, Android Session Log row render cap, and Monthly/Weekly next navigation clamping at the current period.

**Evidence:** `npm test` includes Android Analytics render-stability patch-contract coverage and native WebView resume/repaint contract coverage. `npm run build` passed with idempotent patching.

**Remaining risk:** Needs a GitHub-built APK and OnePlus Pad Go runtime test for Analytics Monthly switching, Focus page open/reopen, app resume, rotation, and WebView console/Logcat evidence.

---

## ISSUE-022 — Profile/onboarding partial updates can wipe academics
**Severity:** HIGH
**Status:** CODE FIX WRITTEN + UNIT TESTED; APK RUNTIME UNVERIFIED (2026-07-01)

The compiled onboarding/profile flow can save academics and then later send a smaller profile payload. A replace-style profile write can erase exam/subject selections from cloud `profile_data`.

**Current fix:** Android profile POST reads existing `profile_data`, deep-merges partial updates, upserts the merged row, and persists completed onboarding with a verified `user_onboarding` upsert only when the merged profile is complete.

**Evidence:** `npm test` includes `profile save deep-merges existing profile_data and persists completed onboarding once`.

**Decision:** Do not run `npm audit fix --force` in this repair. Track a separate Capacitor 8 migration after the Floating Timer/auth/sync runtime issues are stabilized.

---

## ISSUE-019 — Android Supabase functions/storage were partially disconnected beyond login
**Severity:** CRITICAL
**Status:** CODE FIX WRITTEN + UNIT TESTED; APK RUNTIME UNVERIFIED (2026-06-30)

User reported the APK is still mostly disconnected from Supabase except login/info. Code review confirmed multiple Android bridge gaps:

- the bridge intercepted `/__supa/functions/v1/*` but not direct absolute Supabase `/functions/v1/*` calls from the Supabase JS client;
- `finish-session` forwarded raw browser payloads instead of SQL parameter names;
- daily leaderboard called nonexistent `get_daily_leaderboard`;
- group leaderboard/analytics forwarded `groupId` instead of `p_group_id`;
- import was a no-op acknowledgment;
- snapshot updated only a timestamp instead of uploading a canonical backup;
- backup upload wrote one loose `userId/backup-*.json` object, creating orphaned files and no canonical restore target.

**Current fix:** `android-bridge.js` now maps direct function URLs and `/__supa/functions/v1/*`, transforms RPC payloads to the exact SQL signatures, propagates non-2xx failures, writes canonical backup/cloud snapshot objects, returns browser restore payloads, and provides explicit storage cleanup preview/apply routes.

**Evidence:** `npm test` covers direct function interception, RPC payload mapping, RPC failure propagation, session sync snapshot upload, canonical backup upload, `BLOCKED_EMPTY_OVERWRITE`, restore payload shape, import archive/promote, and stale archive cleanup.

**Remaining risk:** Needs GitHub-built APK runtime verification with the real Supabase project, because RLS/Data API/Storage policies can still block requests even when the client contract is correct.

---

## ISSUE-020 — Focus page intermittent black screen and dark-mode PNG logo
**Severity:** HIGH
**Status:** REPORTED; NOT YET REPRODUCED (2026-06-30)

User reported that opening the Focus page sometimes works, sometimes does not, and sometimes shows a full black screen. User also reported the app logo is a PNG and looks wrong in dark mode.

**Current state:** Not fixed in this checkpoint. The current code adds WebView hardware acceleration and renderer priority to reduce WebView rendering instability without changing the UI, but this is not proof that the Focus black-screen bug is fixed.

**Required evidence before fixing:** GitHub-built APK, exact route, Logcat, WebView console output, screenshot, whether it happens after rotation/backgrounding, and whether the Floating Timer bridge is active.

---

## ISSUE-016 — Native app polish gaps: logo, keyboard, back button, font scale
**Severity:** HIGH
**Status:** CODE FIX WRITTEN + UNIT TESTED (2026-06-30)

User reported the APK still felt PWA-like and requested the isotope-code logo, Android app-shell stabilization, and a proper Font Size section in Settings.

**Current fix:** Launcher vector and density PNG resources now use isotope-code logo assets; manifest uses `adjustResize`; bridge handles Capacitor back-button events; Settings bundle gets a matching Font Size slider persisted to profile/localStorage and applied by the bridge on startup.

**Evidence:** `npm test` verifies the Settings patch and Android native resource contracts. `npm run build` passed through sync and idempotent patching.

**Remaining risk:** Needs device layout/keyboard/back-button verification from the GitHub-built APK.

## ISSUE-031 — Community pages run a second React instance (fragile, not corrupt)
Ported as-is from tag v3.3.9; old chunks (`CommunityHub`, `SingleGroup`, `GroupChat`,
`useGroups`, `sessionSync`, …) link OLD vendors (`vendor-react-BfU3Zn2J.js`,
`vendor-motion-Cp_NPzpZ.js`, `vendor-query-Rjz85D0S.js`, `vendor-router-CmoTwRnm.js`).
Same-name CURRENT vendors export different minified symbols, so aliasing was impossible;
a whole-graph port is self-consistent but executes a second React copy; dual-React →
invalid-hook/perf hazards only on community/group screens. Main app (auth, onboarding,
dashboard, focus, analytics, wrapped, landing) runs modern bundles + our baked Supabase.
FIX PATH: rebuild community feature against current build (isotope-code source), or wait
for next upstream build; do not delete old chunks (they resolve the graph).
