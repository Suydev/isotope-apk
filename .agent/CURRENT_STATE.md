# IsotopeAI Android — Current State

**Updated:** 2026-07-08
**Branch:** main
**Latest commit:** c8e2f0f — "fix: guard installScrollEnabler against missing pushState in test harness"
**Current phase:** Bug fixes applied; CI in progress (Run #85/#24 on c8e2f0f8); awaiting APK build and device verification

---

## Verified This Session (2026-07-08)

- [x] `npm test`: **62/62 PASS** (was 0/62 before this session — all tests were crashing at bridge init)
- [x] `node --check` on all bridge/patch scripts: PASS
- [x] `npm run apply-patches` on committed www/: PASS (all patches idempotent — 0 failures)
- [x] `git push origin main` (isotope-apk): PASS — commit `c8e2f0f`
- [x] Supabase migration `009_community_hardening.sql` applied to prod — HTTP 201
- [x] Supabase migration `010_cleanup_group_members_rls.sql` applied to prod — HTTP 201
- [x] group_members policies verified: exactly 3 (gm_client_insert_compat INSERT, gm_read_members SELECT, gm_self_delete DELETE)

## What Changed This Session (2026-07-08)

### Root Cause Fixed: Test Suite 0/62 → 62/62
- `android-bridge.js` `installScrollEnabler` IIFE called `window.history.pushState.bind()` before checking existence
- Node.js test harness has `history: { back() {} }` only — no pushState
- **Fix:** added guard `typeof window.history.pushState !== 'function'` at top of IIFE — early return in non-browser envs

### Supabase Migrations Applied
- `009_community_hardening.sql` — 7 community RPCs now live in prod
- `010_cleanup_group_members_rls.sql` — group_members now has 3 correct policies; `gm_client_insert_compat` allows owner INSERT

### Bug Fixes Applied to www/ and apply-android-patches.js
- **syncFailed boot trap** (`AppAccessGate`): changed CTA from "Retry from home" → "/" to "Sign In" → "/auth"
  so unauthenticated users aren't trapped on the "Cloud state unavailable" black screen
- **Group creation silent failure** (`useGroups`): fixed silent `console.error` swallow — now throws
  proper error so users see "Failed to add you as group owner. Please try again."

---

## Supabase Project
- Ref: `vteqquoqvksshmfhuepu`
- URL: `https://vteqquoqvksshmfhuepu.supabase.co`
- Access via `SUPABASE_PAT` secret (Management API)

---

## www/ Pre-built Status
- All patches applied and committed to `www/` in the repo
- CI does NOT need a separate isotope-code checkout — the pre-built www/ is committed
- CI workflow android.yml runs tests then builds APK using committed www/
- Last CI run: #85 (android.yml) + #24 (release.yml) on c8e2f0f8 — IN PROGRESS as of 2026-07-08

---

## Test Coverage
- `npm test`: 62/62 PASS
- `npm run apply-patches` idempotency: PASS (0 errors, 0 failures)
- GitHub Actions CI: IN PROGRESS on c8e2f0f8

---

## Device Test Status

| Feature | Code | Unit | CI Build | Device |
|---------|------|------|----------|--------|
| Auth login hydration | ✅ | ✅ | 🔄 | ❌ |
| syncFailed → /auth CTA | ✅ | ✅ | 🔄 | ❌ |
| Group creation error throw | ✅ | ✅ | 🔄 | ❌ |
| Community RLS/RPC (migration 009+010) | ✅ | ✅ | 🔄 | ❌ |
| Supabase connectivity beyond login | ✅ | ✅ | 🔄 | ❌ |
| Floating Timer overlay | ✅ | ✅ | 🔄 | ❌ |
| Focus timer notifications | ✅ | ✅ | 🔄 | ❌ |
| Analytics black-screen fix | ✅ | ✅ | 🔄 | ❌ |
| Scroll on /privacy and settings | ✅ | ✅ | 🔄 | ❌ |
| Privacy page "can't scroll" | ✅ | ✅ | 🔄 | ❌ |
| SCHOLAR badge shows plan_type | ✅ | ✅ | 🔄 | ❌ |
| Invite deep links | ✅ | ✅ | 🔄 | ❌ |

---

## Known Device-Reported Issues (from screenshots July 6-7)

1. ✅ FIXED: "Failed to load groups" SupabaseCircuitBreakerError 500 → fixed by migration 010
2. ✅ FIXED: "Cloud state unavailable" with no login path → syncFailed now shows "Sign In" → /auth
3. ✅ FIXED: Group creation fails silently → now throws error to UI
4. ⬜ UNVERIFIED: Privacy/settings can't scroll → installScrollEnabler should fix after pushState guard
5. ⬜ UNVERIFIED: Avatar skeleton circles → CSS `[class*="avatar-stack"] div:empty{display:none}` in bridge
6. ⬜ UNVERIFIED: Leaderboard podium text clipping → rank-3 height h-24→h-32 patch
7. ⬜ UNVERIFIED: SCHOLAR badge shows plan_type → DashboardHeader patch uses k?.plan_type

---

## Next Steps for Following Agent

1. **Confirm CI passes** — check GitHub Actions run #85/#24 on c8e2f0f8
2. **Download and install APK** — Run #85 artifact: debug APK for device test
3. **Device verification priorities:**
   - Login flow: does app reach dashboard after credentials?
   - syncFailed screen: does it now show "Sign In" → /auth instead of looping to /?
   - Group creation: does the error surface to UI if it fails?
   - Community groups: can you create a group and see it listed?
   - Privacy page scroll: does touch-scroll work on /privacy now?
4. **View All Members button** — not yet fixed (no code written)
5. **Agent context** — this file is up to date as of 2026-07-08
