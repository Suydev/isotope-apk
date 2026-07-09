# IsotopeAI Android — Next Tasks

---

## Task Queue

### TASK ANDROID-012
**Priority:** P0
**Status:** ACTIVE — community 500 fixed + challenges unlocked; awaiting new APK from CI
**Objective:** Runtime-test the current APK on device.

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

---

### TASK ANDROID-016
**Priority:** P1
**Status:** TODO
**Objective:** Responsive and orientation verification on Android.

---

### TASK ANDROID-017
**Priority:** P2
**Status:** TODO
**Objective:** Plan Capacitor 8 migration to resolve dev dependency audit findings.

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
