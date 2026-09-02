# IsotopeAI Android — Known Issues

---

## ISSUE-048 — Native bug hunt: six defects in the overlay, activity and local server
**Severity:** HIGH (one unrecoverable, one crash) — **FIXED 2026-08-31**
**Files:** `FloatingTimerService.java`, `MainActivity.java`, `PipHttpServer.java`
**Regression tests:** `test/android-layout-parity.test.mjs` (11 new, 30 total)

No JVM exists in this environment, so these were found by reading the source and
reproducing the arithmetic in Node. Each was verified before being fixed.

### 1. The overlay could be dragged permanently off-screen (unrecoverable)

`handleDragTouch` wrote the position with no clamp:

```java
layoutParams.x = windowStartX + dx;                  // no clamp at all
layoutParams.y = Math.max(0, windowStartY + dy);     // floor only, no ceiling
```

`FLAG_LAYOUT_NO_LIMITS` is set, so the window manager does not clamp either.
Computed on a 1080×2400 screen: `x = -900` leaves **zero pixels visible**. The
position is then persisted to SharedPreferences on `ACTION_UP`, so it survives a
restart — and the only way to move the overlay is by dragging its header, which is
now off-screen. Unrecoverable short of clearing app data.

Fixed with `clampOverlayX` / `clampOverlayY`, which keep `EDGE_KEEP_DP = 56dp` of
the card on screen — a real touch target, not one pixel. Verified across 56
positions from ±99999 on a 1080×2400 screen, and on 320/480/720px screens where
the overlay is wider than the display (the degenerate `max < min` branch). A
position read from preferences is now clamped **before it is trusted**, because a
position saved on another screen size, in another orientation, or by a build
without this fix, can already be off-screen.

### 2. `maybeNotifyCompletion` crashed on API 24/25 — at the moment a session ended

`minSdkVersion` is 24. That method constructed `NotificationChannel` and
`Notification.Builder(Context, String)`, both **API 26**, with no `SDK_INT` guard —
while every other channel site in the file is guarded.

Worse, the wrapper was `catch (Exception)`. This throws `NoClassDefFoundError`,
which extends `Error`, **not** `Exception`, so it was not caught: the exception
propagated out of `tickRunnable`, killing the 1-second tick that drives the
countdown and the notification. The failure happened exactly when the user was
being told their session was complete.

Fixed with a version-guarded channel path, a pre-O `Notification.Builder` fallback
using `PRIORITY_HIGH` + `DEFAULT_VIBRATE`, and a `catch (Throwable)` so no `Error`
can kill the tick. Also replaced `getApplicationInfo().icon` with
`R.drawable.ic_notification` — the launcher icon renders as a white square in the
status bar on API 26+ when it is adaptive.

### 3. Queued action ids collided, silently dropping input

```java
action.put("id", System.currentTimeMillis() + "-" + Math.abs(type.hashCode()));
```

Two taps of the **same** button inside one millisecond produce an identical id, and
`removeQueuedAction` filters by id — so acknowledging one removed **both**. A
double-tapped "correct" recorded one. Now uses a static `AtomicLong`, which cannot
collide regardless of tap speed.

### 4. `PipHttpServer` was never stopped

`start()` is called from `onCreate`, `onStart` and `onResume`; `stop()` was called
from nowhere. Two `ServerSocket`s and their threads outlived every activity
instance, and the class holds a **static `Context`**.

Now stopped in `onDestroy`, but only when `isFinishing()` — `onDestroy` also runs
for a configuration change, where tearing the sockets down would rebind them on
every rotation, and the overlay service reads state through this server.

### 5. Unbounded request body from `Content-Length`

```java
for (int i = 0; i < contentLength; i++) body.append((char) in.read());
```

`Content-Length` is attacker-controlled, and **any app on the device can reach
`127.0.0.1:3000`** — "local" is not "trusted" on Android. A request claiming
`100000000` with no body ran 100M iterations building a `StringBuilder`;
`setSoTimeout` does not bound it, because `read()` only throws once it actually
blocks, and at EOF it returns immediately. Separately, `read()` returns `-1` at
EOF and `(char) -1` is `0xFFFF`, so a truncated body appended U+FFFF characters
instead of stopping.

Capped at 64 KB (a timer-state snapshot is under 4 KB) with an explicit EOF break.

### 6. One raw thread per connection

`new Thread(() -> handle(sock)).start()` per accept was unbounded: a local app
could open connections in a loop and spawn threads until the process died.
Replaced with a bounded `ThreadPoolExecutor` (2–24, `SynchronousQueue`, daemon
threads) that closes a rejected socket rather than dropping it silently. The
maximum has to exceed the number of concurrent SSE streams, because each holds its
worker for the life of the connection — a pool sized for request/response would
stall as soon as two event streams were open.

### Also fixed: no rotation handling in the service

`MainActivity` has `onConfigurationChanged`; the service did not, and a service
does not receive the activity's. Geometry is stored in pixels, so a portrait
position can be off-screen in landscape and a width clamped to 440dp portrait
exceeds the 36% landscape cap. `reclampOverlayGeometry` now runs on rotation,
posted to the handler because `getResources()` can still report pre-rotation
metrics at callback time.

### A note on the tests

Two of the new assertions failed on correct code before I fixed the tests
themselves, and both are worth recording:

- A `doesNotMatch` forbidding the old defective line matched **its own
  explanation in a comment**. Forbidden-pattern checks now read comment-stripped
  source. A check that forbids describing history is not a check.
- An assertion scoped to `service.slice(start, start + 1200)` broke when a comment
  pushed the assignment to offset 1208. It is now bounded by the next method
  declaration, so it tracks structure rather than byte offsets.

---

## ISSUE-047 — Buddy payload shape mismatch: Community crashed on the first accepted buddy
**Severity:** CRITICAL — **FIXED + APPLIED TO PROD 2026-08-30**
**Migration:** `supabase/021_fix_buddy_handle_and_overview.sql` (same file as ISSUE-045)

Mine, introduced by the ISSUE-045 fix and caught before anyone hit it.

`community_get_overview` as first rewritten returned **flat** `status` and
`currentSubject`. The compiled bundle reads a **nested** `presence` object, at 22
sites, none of them guarded:

```
c.presence.state     2      s.presence.state     6
c.presence.subject   3      s.presence.subject   7
                            s.presence.task      4
```

The worst is the mapper that turns a buddy into a member row, not a filter:

```js
{ …, status: s.presence.state, currentSubject: s.presence.subject || null, … }
```

The `|| null` on `subject` shows the author expected the *field* to be absent — but
the *object* is dereferenced raw one line earlier, so the guard never runs.

So `s.presence` was `undefined` for **every** buddy, not merely ones lacking a
presence row, and any render of an accepted buddy threw
`Cannot read properties of undefined (reading 'state')`, unmounting the tree and
blanking the page. Nothing had hit it only because `community_request_buddy` failed
for everyone (ISSUE-045), so no accepted pair existed anywhere — **the first person
to accept a buddy request would have crashed the Community tab.**

**Fix: emit both shapes.** `presence: {state, subject, task}` *and* flat
`status`/`currentSubject`, because both spellings are read by different components
in the same bundle and the bundle is baked into the APK — it cannot be the thing
that changes. `presence` is always an object, never null, since a null would
reintroduce the same crash by another route.

Three further shape bugs found while verifying, all in the same class of "the UI
distinguishes states the RPC collapsed":

- **`shareCurrentTask` had no gate.** `presence.task` is rendered, and
  `community_get_privacy` exposes the flag, but the RPC had no
  `share_task` — so a user sharing a subject but not a task leaked the task.
- **Withheld `questions` was stripped, not nulled.** The UI tests
  `r.questions !== null`; a stripped key is `undefined`, which is `!== null`, so it
  rendered the literal text **"undefined questions"**. Now set to JSON `null`,
  which renders as the intended em dash.
- **Withheld `subjects`/`tasks` returned `[]`.** The UI distinguishes them:
  `=== null` → "Subject details are not shared", `[]` → "No settled study time in
  this period". Returning `[]` for a withheld field told the reader their buddy did
  nothing today — a different, wrong statement. Both now return `null` when
  withheld and `[]` when genuinely empty.

**Verified** against the real RPC with two real JWTs, across five privacy states
(all-on, stealth, task-off, questions-off, breakdown+tasks-off). Every one of the
16 paths the bundle dereferences is defined in all five; `undefined paths: NONE`.

`./supabase.sh check` now asserts the shape as a 13th check. It reads the
**function body**, not the function's output: `community_get_overview` filters on
`auth.uid()`, and the management API runs as `postgres` with no JWT, so the array
is always empty there regardless of how many buddy rows exist — on the test project
`auth.uid()` is NULL, `community_friends` has 1 row, and `buddies` returns 0.
Inspecting the output would have reported on a payload no user ever receives.

---

## ISSUE-046 — The signup trigger did not exist; 32 of 43 accounts had no app data
**Severity:** CRITICAL — **FIXED + APPLIED TO PROD 2026-08-30**
**Migration:** `supabase/022_restore_signup_trigger.sql` (rollback `_rollback_signup_trigger.sql`)

`handle_new_user()` existed and was correct. Nothing called it.

```
select count(*) from auth.users;                                 -> 43
select count(*) from public.users;                               -> 11
auth users with no public.users row                              -> 32
select tgname from pg_trigger where tgname='on_auth_user_created' -> []
select proname from pg_proc  where proname='handle_new_user'      -> 1 row
```

`handle_new_user()` seeds five rows on signup: `public.users`, `user_profiles`,
`user_points`, `user_stats_summary`, `user_presence`. Without the trigger, a new
account got an auth identity and none of them.

**This is the root of the whole "community is broken" family of reports.** On a
freshly created account, `community_bootstrap_profile` fails
`409 23503 Key (user_id)=(…) is not present in table "users"` — raised by
`tr_sync_user_onboarding_from_profile`, because `user_onboarding` FKs to
`public.users`. Reproduced end-to-end with two real JWTs: enrolment failed for
both users before the trigger existed and succeeded for both immediately after,
with nothing else changed. It is also why `select count(*) from user_profiles`
returned 0 on a project with dozens of accounts, and why `ux_profiles_handle`
indexed a column nothing populated.

**Why no backup carried it, and why verification passed anyway.** The trigger is
on `auth.users`. `scripts/supabase-backup.mjs` and `scripts/schema-dump.mjs` both
exclude the `auth` schema — right for tables, wrong for this. The manifest listed
14 triggers, all on `public`, and every one of them fires on
`INSERT INTO public.users` — the *second* stage. The first stage, auth → public,
was the one lost. So every restore produced a database that passed 94/94 checks
and could not accept a signup.

Fixed in three places, not one:
- `022` restores the trigger and backfills all 32 accounts using the same column
  set, defaults and username derivation as `handle_new_user()`, so a backfilled
  row is indistinguishable from a trigger-created one.
- `schema-dump.mjs` now emits triggers on `auth.users` whose function lives in a
  dumped schema, so future restores carry it.
- `supabase-backup.mjs` inventories them, and `verify` now checks
  `on_auth_user_created` **unconditionally** plus asserts zero orphaned auth
  users — an unconditional check is required because backups taken before this
  fix do not list the trigger at all.

Prod after applying: 43 auth users, 43 `public.users`, 43 profiles, 43 points,
43 presence, 0 orphaned, trigger present.

---

## ISSUE-045 — Buddy feature entirely dead: handle written and read in different places
**Severity:** CRITICAL — **FIXED + APPLIED TO PROD 2026-08-30**
**Migration:** `supabase/021_fix_buddy_handle_and_overview.sql` (rollback `_rollback_buddy_handle.sql`)

Two independent defects, both verified live with real user JWTs.

**1. The handle is written to one location and read from another.**

```
community_bootstrap_profile  WRITES  profile_data->>'community_handle'  (JSONB key)
community_request_buddy      READS   user_profiles.handle               (real column)
```

`user_profiles` has both. The writer only ever populated the JSONB key, so the
column was NULL for every user and

```sql
select user_id into fid from public.user_profiles where lower(handle) = lower(p_handle)
```

could never match. Every buddy request raised `user_not_found`, for every handle,
for every user, always:

```
community_request_buddy {p_handle:"suyash"}              -> 400 P0001 user_not_found
community_request_buddy {p_handle:"elixir_suyashprabhu"} -> 400 P0001 user_not_found
community_respond_buddy {p_connection_id, p_accept}      -> 200 {"ok": true}
community_remove_buddy  {p_other_user, p_block}          -> 200 {"ok": true}
```

Note which pass. Only the **entry point** was broken, which is why the feature
looked dead rather than partly broken — respond and remove work fine, but you can
never create a connection for them to act on.

Fixed: bootstrap writes the column *and* the key; `request_buddy` accepts either,
plus `users.username`, so accounts that enrolled before this migration or never
enrolled at all are still findable; and a deduplicating backfill populates the
column from data users already own. The dedup is not optional — a naive `UPDATE`
failed on real data with `23505 … Key (lower(handle))=(suyash) already exists`
because two accounts held `suyash` and `Suyash`.

**2. `community_get_overview` never returned buddies.**

It returned only `stats` and `groups`. The UI reads
`overview.buddies` and splits it by `requestStatus`, with
`s.buddies = s.buddies || []` normalising the missing key — so no error, just a
permanently empty buddies panel. This is the second half of the report: even
after a request succeeded, nothing appeared.

The RPC now returns exactly the fields the compiled bundle reads — `userId`,
`connectionId`, `requestStatus`, `outgoing`, `name`, `handle`, `avatarUrl`,
`status`, `currentSubject`, `minutesToday`, `subjects[{name,minutes,questions}]`,
`tasks[{id,title,subject,done}]` — plus `groupRequests`, which was silently empty
for the same reason. `activeNow` is a real count now instead of a hardcoded 0.

**Privacy is enforced server-side**, from each buddy's own
`community_enrollments.privacy`. A client-side filter is not a privacy control:
the data has already left the database. `stealthMode` collapses live status and
subject; `shareTasks`, `shareSubjectBreakdown`, `shareQuestionCounts`,
`shareExactTime` and `shareCurrentSubject` each gate their own field. Verified by
flipping them and re-reading as the other user.

Pending requests carry `outgoing`, because `community_respond_buddy` is only valid
for a request sent *to* you — rendering your own outgoing request with an Accept
button produces a control that can never work.

**Error messages are now readable.** `communityApi` surfaces the Postgres message
verbatim (`u = e => e instanceof Error ? e.message : …`), so `raise exception
'user_not_found'` rendered as literally "user_not_found" in the UI. The bundle is
baked into the APK, so the text has to come from SQL: now
"No one is using the handle @x. Check the spelling and try again."

**Verified end-to-end on a clean pair of signups:** enrol both → request by
handle, `@handle`, and `HANDLE` (all resolve to one connection) → unknown and
self rejected with readable text → pending visible to both with correct direction
→ accept → B logs 90 min of Physics and a task → A sees `minutesToday: 90`,
`subjects:[{Physics,90}]`, `tasks:[…]`, `status: "studying"`,
`currentSubject: "Physics"` → stealth on: status `idle`, subject `null` →
tasks+breakdown off: both empty, minutes still visible → remove: list empty.

---

## ISSUE-044 — Google sign-in returned to the app signed OUT, with a reload storm
**Severity:** CRITICAL — **FIXED IN CODE 2026-08-30**
**Status:** APK RUNTIME UNVERIFIED (needs a build ≥ 248)

Reported from device: signed in with Google, came back to the app, was not signed
in, and the app was reloading at high frequency. Logcat (build 247, 11:27):

```
FETCH_OK  /rest/v1/users?id=eq.9064bf89-…      -> 204
FETCH_OK  /rest/v1/user_profiles?select=…      -> 200
FETCH_OK  /rest/v1/user_stats_summary?…        -> 200
FETCH_OK  /rest/v1/daily_user_stats?…          -> 200
FETCH_OK  /rest/v1/user_settings?…             -> 200
FETCH_OK  /rest/v1/user_onboarding?select=…    -> 401   ←
FETCH_OK  /rest/v1/study_sessions_log?…        -> 401   ←
```

Three separate defects compounded. The token itself was fine — the OAuth work in
ISSUE-041/042 did land, `/rest/v1/users` PATCH returned 204, so the session had a
valid user and a working JWT.

**1. `supaFetch` had no 401 retry, while `rpcPost` did.**
A mix of 401 and 200 for the same user in the same burst is not a grants or RLS
problem: verified that both `anon` and `service_role` read all seven of those
tables (HTTP 200 each), and `isotope-complete.sql` grants SELECT on every one to
`anon`, `authenticated` and `service_role`. It is one access token crossing `exp`
mid-flight — whichever requests are in the air at that moment come back 401.
`rpcPost` has always refreshed and retried once; the plain REST path did not, so
community RPCs survived an expiry and bootstrap did not. `supaFetch` now retries
a 401 once after `refreshStoredSessionIfNeeded()`, and re-reads the headers so the
retry carries the NEW token rather than replaying the one that just failed. Only
when a real user token is present — a 401 while sending the anon key means "not
signed in", and refreshing that would loop.

**2. A failed `user_onboarding` read logged the user out.**
`bootstrapWithSession` required all three of profile/user/onboarding to be `ok`,
else returned `bootstrap_db_unavailable` 503. The app reads 503 as signed-out and
remounts `/auth`. So one 401 on a non-essential table discarded a valid session.
Worse, a missing onboarding row is a legitimate state for a brand-new Google
account, so this was wrong even without the 401. Onboarding is now non-fatal: it
warns, treats the row as absent, and lets the existing inference path run. Only
`user_profiles` and `users` remain fatal.

**3. Every reload guard was per-document, so "reload once" meant "reload forever".**
`reloadAttempted`, `crashRecoveries` and `lastCrashRoute` in
`setupAndroidRenderRecovery` are plain `var`s. A reload creates a new document,
which resets them to their initial values — so each fresh document believed it had
never reloaded and was entitled to one more. With bootstrap failing persistently,
that is an unbounded loop, and it is exactly the "very high frequency of automatic
reloading" that was observed. `boot-recovery.js` already caps its own reloads in
`sessionStorage` (`__iso_reload_count`) for this reason; the in-page path now does
the same via `__iso_render_reloads` (budget 2) and `__iso_crash_recoveries`
(budget 3). The budget is cleared 5s after a load in which `#root` actually has
children, so a healthy session does not carry a spent budget around. Out of
budget, the user gets the refresh notice instead of another reload.

Also fixed while here: `profilePromise` / `userPromise` / `onboardingPromise` had
no `.catch`, unlike the four optional queries beside them. A thrown fetch rejected
the whole `Promise.all` and skipped the 503 branch entirely, producing an
unhandled rejection — which `setupAndroidRenderRecovery` then reads as a crash and
reloads on. All three now resolve to `{ok:false}` like their neighbours.

**Verify on device:** sign in with Google, then confirm in Logcat that no
`/rest/v1/*` request ends on a 401 without a following retry, that
`[ISO-BRIDGE] user_onboarding unreadable` (if it appears at all) does not lead to
`/auth`, and that at most two reloads occur before the refresh notice.

---

## ISSUE-042 — Code-callback deep links reported as unconsumed
**Severity:** CRITICAL — **FIXED IN CODE + UNIT TESTED 2026-08-28**
**Status:** APK RUNTIME UNVERIFIED

`__isoHandleOAuthDeepLink` ended with:

```js
return handleOAuthCallback(frag, isCustomScheme) === true;
```

`handleOAuthCallback` returns a **Promise** on the `?code=` exchange branch, and a
promise is never `=== true`. So every authorization-code callback reported
not-consumed: `MainActivity.deliverOAuthPayload` retried 12 times and then
navigated to `/auth` — while the exchange was still running underneath.

This project's Supabase issues `response_type=code` with no `code_challenge`
(verified live), so `?code=` is the **normal** return path, not an edge case.

**Fix:** detect a thenable and report accepted, letting the async branch own the
redirect. Also hardened the exchange itself: it reads `text()` before parsing (an
HTML gateway error was surfacing as a JSON parse failure instead of the real
reason), reports the actual `error_description`, and tries both `pkce` and
`authorization_code` grants — with no verifier present the correct grant is not
knowable up front, so trying both removes a guess.

---

## ISSUE-041 — Google sign-in returned to the app but did not log in
**Severity:** CRITICAL — **FIXED IN CODE + UNIT TESTED 2026-08-28**
**Status:** APK RUNTIME UNVERIFIED

Reported from device. The log told the whole story:

```
[12:19:49] FETCH     https://<ref>.supabase.co/auth/v1/user
[12:19:49] FETCH_OK  https://<ref>.supabase.co/auth/v1/user -> 200
                                                    ← then nothing
```

The token was accepted and `/auth/v1/user` answered 200. Then the log stopped.

**Root cause.** In `storeSessionAndRedirect`:

```js
fetch(SUPA_URL + '/auth/v1/user', …)
  .then(…)                             // persists session.user — ASYNC
  …
window.location.href = safeRedirect;   // navigates NOW, synchronously
```

The document tore down before `.then()` ran, so the session was persisted with
tokens and **no `user`**. `/__auth/bootstrap` rejects exactly that with
`no_user_id`, and the app bounced back to the login screen.

This is the same failure mode as ISSUE-033 from the other side: that fix taught
bootstrap to *recover* from a userless session, but left the race that *creates*
one. The comment directly above the fetch even read "this lookup is what actually
completes a Google sign-in" — and the next line navigated away from it.

**Fix:** the redirect now waits for the lookup, with a 6s cap. Landing
signed-out is recoverable; being stranded on the callback screen is not. The
ranker PATCH is deliberately *not* awaited — it is a side effect and must not
delay the user reaching the app.

**Tests:** 4 — redirect waits and `user` is persisted; a code deep link reports
consumed; the exchange retries the alternate grant; a failed lookup still lets
the user through with tokens intact.

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
