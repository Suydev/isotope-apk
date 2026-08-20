# IsotopeAI Android — Next Tasks

---

## Task Queue

### TASK ANDROID-012
**Priority:** P0
**Status:** ACTIVE — bundles fixed; awaiting phone browser + device verification
**Objective:** Runtime-test the current APK on device.

**Latest (2026-08-20):**
- **`apply-android-patches.js` DELETED.** Build no longer rewrites bundles.
  Any Android integration must be baked into the committed `www/` (see AGENTS.md).
- WebView crash `Missing initializer in destructuring declaration` FIXED — corrupt
  patches removed from `Auth`, `useOnlineStatus`, `useAuthStore`, `useNotificationStore`,
  `workbox-window`, `Analytics`; all 141 www JS files parse as modules; tests 57/0.
- **DONE 2026-08-20: asset graph complete.** Restored 28+5 missing chunks from git tag
  `v3.3.9` (`60eae02a`) + 12 missing CSS from live site into `www/assets/`;
  stripped old-app boot side-effect import (`index-BPYJFSVW.js`) from
  `CommunityHub`/`Community`; removed stale mapDeps preloads → **0 unresolved
  imports/www**; all files parse; tests 57/0 (61). Build pushed (run pending).
- Verify on phone browser first (http://192.168.1.63:8080/ → /signin), then build + test APK.
- **KNOWN LIMITATION:** community subgraph (old 3.3.9 chunks) loads a SECOND React
  instance (old `vendor-react-BfU3Zn2J.js`) — community/group pages may misrender
  or crash hooks at runtime. Rebuild-from-source (isotope-code) is the proper fix;
  see KNOWN_ISSUES ISSUE-031.

**What's in the latest builds:**
- pushState guard fix (63/63 tests pass)
- syncFailed CTA → /auth (login path from black screen)
- Group creation error now surfaces to UI
- Supabase community migrations 009+010+011 applied
  - **011 is critical:** fixed infinite RLS recursion that caused ALL community queries to 500
- Group categories backfilled (Science/Coding/Languages/etc.)
- group_challenges now accessible to anon (GRANT applied)
- Bridge: get-daily-leaderboard with groupId → routes to group leaderboard RPC
- **NEW (2026-07-09): useGroupChallenges premium gates removed** — all challenge queries now enabled for all users; 3 gates unlocked (useGroupChallengesWithUpcoming, challengeParticipants, allGroupChallenges)
- **NEW (2026-07-09): Community data seeded** — 20 challenges and 16 announcements across all 8 groups (migration 012_seed_community_data.sql applied to prod)
- **NEW (2026-07-09): Invite URL fixed** — android-bridge.js __ISO_INVITE_DOMAIN__ changed from 'https://isotopeai.in' to 'isotopeai:/' so invite links produce isotopeai://invite/CODE deep links handled by MainActivity
- **NEW (2026-07-09): Deep-link parser fixed** — MainActivity.resolveDeepLinkRoute() now correctly handles isotopeai://invite/CODE (Android parses host="invite", path="/CODE"; old regex was wrong producing /invite//CODE)
- **NEW (2026-07-09): Community error boundary** — www/Community-DIqF5406.js "Reload community" no longer does window.location.reload(); it correctly clears error state and lets React re-render children
- **NEW (2026-08-14): Removed 41.8MB unused WAV files** from public/sounds/ (code loads sounds from GitHub URLs)
- **NEW (2026-08-14): Capacitor 8 migration plan** — see CAPACITOR_8_MIGRATION.md
- All existing patches (auth hydration, Floating Timer, Analytics fix, etc.)

**Device acceptance checklist:**
- [ ] Community groups load — GroupDiscovery shows list of public groups
- [ ] Category filters work (Science / Coding / Languages / etc.)
- [ ] Create group: form submit → group appears in My Groups
- [ ] Join group: appears in My Groups after joining
- [ ] Group members list shows all members in SingleGroup
- [ ] Group challenges show on CommunityHub
- [ ] Login: credentials → loading → dashboard (not back to login)
- [ ] syncFailed screen shows "Sign In" button pointing to /auth
- [ ] Privacy/settings page scrolls with touch
- [ ] Floating Timer overlay opens and is draggable
- [ ] Analytics page — no black screen on Monthly switch

---

### TASK ANDROID-013
**Priority:** P0
**Status:** TODO
**Objective:** Verify Supabase connectivity beyond login on physical device.

**Acceptance:**
- Settings/cloud sync does not falsely say offline
- Manual backup uploads to canonical paths
- Session sync / leaderboard / group analytics work
- Community group creation + join flow works end-to-end (2-account test)

---

### TASK ANDROID-014
**Priority:** P0
**Status:** TODO
**Objective:** Runtime test Floating Timer on OnePlus Pad Go.

**Acceptance:**
- Questions/Practice/Revision opens Floating Timer
- Display-over-other-apps permission works
- Draggable over another app
- Correct/Incorrect/Skip/Undo update store counts
- Timer survives backgrounding and process death

---

### TASK ANDROID-015 — View All Members button
**Priority:** P1
**Status:** TODO
**Objective:** Fix the View All Members button in SingleGroup which is broken on Android.

**What we know:**
- No fix has been written yet
- Issue: button tap likely has no onClick handler or navigates to a route that doesn't exist
- The button exists at id="view-members-button" in SingleGroup bundle
- Need to find onClick handler `x` and trace what it does

**2026-07-09 investigation (static analysis only, no device repro):** Traced `x` to
`toggleMembersDrawer` from the module-level, correctly-created (not re-created per render)
Zustand store in `SingleGroup-DU1IhoNK.js` (`Ut=Wt()(Jt((t,r)=>({...})))`). The members drawer
component (`Ea`) receives `isOpen:l` (`isMembersDrawerOpen`) and `onClose:x` (the same toggle
fn) — this wiring looks correct in the compiled bundle; no static bug found. Do not re-guess a
fix without device evidence (Logcat + screen recording of the tap) — next agent should get
that evidence first, since two independent static passes found nothing wrong here.

---

### TASK ANDROID-016
**Priority:** P1
**Status:** CODE FIX WRITTEN (2026-07-09) — APK RUNTIME UNVERIFIED
**Objective:** Responsive and orientation verification on Android.

See ISSUE-023 in KNOWN_ISSUES.md — root cause found and fixed (`MainActivity` had no
`onConfigurationChanged` override, so rotation never triggered the WebView repaint path that
`onResume` already had). Needs a GitHub-built APK and physical rotation test to close out.

---

### TASK ANDROID-017
**Priority:** P2
**Status:** PLAN WRITTEN — see CAPACITOR_8_MIGRATION.md
**Objective:** Migrate Capacitor 6.2.1 → 8.5.0 to resolve npm audit vulnerabilities (3 vulns through tar@6.2.1).

**Plan:** See `.agent/CAPACITOR_8_MIGRATION.md` for full migration steps, risks, and rollback plan.

---

## Supabase Migrations Applied (chronological)
1. `009_community_hardening.sql` — 7 community RPCs
2. `010_cleanup_group_members_rls.sql` — restored gm_client_insert_compat
3. `011_fix_rls_recursion.sql` — **CRITICAL: fixed HTTP 500 infinite recursion**
   - Fixed gm_read_members to use SECURITY DEFINER _is_group_member
   - Dropped gchall_manager_write + gann_manager_write (recursive ALL policies)
   - Backfilled group categories
   - GRANT SELECT on group_challenges to anon
   - gchall_read policy now allows all authenticated users to see active challenges

## RPCs Available (confirmed)
- `get_leaderboard(p_period, p_limit, p_offset)` → global leaderboard
- `get_group_leaderboard(p_group_id, p_limit)` → group-scoped leaderboard
- `get_group_analytics_from_snapshots(p_group_id, p_days)` → group analytics
- `create_community_group(name, description, category, cover_url, is_public, max_members, visibility)`
- `join_community_group(p_group_id)`
- `leave_community_group(p_group_id)`
- `delete_community_group(p_group_id)`
- `update_group_member_role(p_group_id, p_user_id, p_role)`
- `accept_invite(p_code)`
- `get_invite_details(p_code)`
