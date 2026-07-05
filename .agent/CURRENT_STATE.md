# IsotopeAI Android — Current State

**Updated:** 2026-07-05
**Branch:** main
**Current phase:** Community hardening committed; awaiting Supabase SQL migration execution + device verification

---

## Verified This Session

- [x] `npm test`: **47/47 PASS** (was 35/47 before this session)
- [x] `node --check` on all bridge/patch scripts: PASS
- [x] `npm run prepare-www` with cloned isotope-code: PASS (57MB, 154 JS chunks)
- [x] `npm run apply-patches` on built www/: PASS (72 patches applied, 0 skipped)
- [x] `git push origin main` (isotope-apk): PASS — commit `f5f5954`
- [x] SQL `009_community_hardening.sql` pushed to isotope-code main via GitHub API — commit `0707233`

## What Changed This Session

### isotope-code (Suydev/isotope-code)
- `sql/009_community_hardening.sql` — NEW: complete community security migration
  - `create_community_group` RPC (atomic group + owner-member, unique slug)
  - `join_community_group` RPC (max_members enforced)
  - `leave_community_group` RPC (owner self-removal blocked)
  - `delete_community_group` RPC (full cascade of all group-owned rows)
  - `update_group_member_role` RPC (self-promotion blocked)
  - `accept_invite` now enforces max_members + bumps member_count
  - `get_invite_details` with slug fallback
  - RLS: group_members INSERT blocked (direct inserts disabled; RPCs are SECURITY DEFINER)
  - RLS: ginv_create now includes 'owner' role (was missing)
  - RLS: announcements/challenges restricted to owner/admin/moderator
  - member_count sync trigger
  - Unique slug constraint with dedup

### isotope-apk (Suydev/isotope-apk)
- `.github/workflows/android.yml` — Fixed all invalid action versions:
  - `checkout@v7` → `@v4`, `setup-node@v6` → `@v4`, `setup-java@v5` → `@v4`
  - `upload-artifact@v7` → `@v4`, `android-actions/setup-android@v4` → `@v3`
- `android/app/src/main/AndroidManifest.xml` — Added HTTPS deep-link intent filters:
  - `https://isotopeai.in/invite/*`
  - `https://www.isotopeai.in/invite/*`
  - `https://isotopeai.in/community/*`
  - Custom scheme: `isotopeai://invite/*`
- `android/app/src/main/java/in/isotopeai/app/MainActivity.java`:
  - `handleDeepLinkIntent()` — cold + warm start handling
  - `resolveDeepLinkRoute()` — parses all supported URI formats
  - `navigateWebViewTo()` — routes to `__iso_navigate` → `pushState` → `location.href`
- `www/` — Pre-built from isotope-code and committed (57MB)
  - Removes dependency on separate isotope-code checkout for CI/builds
- `.gitignore` — www/ no longer ignored
- `test/prepare-patches.test.mjs`, `test/floating-timer-native.test.mjs`,
  `test/latex-rendering.test.mjs` — SOURCE_REPO path fix (finds `./isotope-code` or `../isotope-code`)
- `.agent/AUDIT_2026_07_05.md` — full audit findings
- `.agent/AUDIT_SERVER_MJS.md` — server.mjs community logic map
- `.agent/AUDIT_FRONTEND_COMMUNITY.md` — frontend community behavior map

---

## ⚠️  CRITICAL: Supabase Migration NOT Yet Applied

`sql/009_community_hardening.sql` is committed to GitHub but **has NOT been executed
in the live Supabase project** (ref: `vteqquoqvksshmfhuepu`).

**Without running it:**
- Direct group_members INSERT is still allowed (security gap open)
- ginv_create policy still excludes 'owner' role
- create_community_group / join / leave / delete / update_role RPCs do not exist in prod
- accept_invite still has no max_members enforcement

**Run migration before building and installing a new APK.**

### Migration Instructions
1. Open https://supabase.com/dashboard/project/vteqquoqvksshmfhuepu/sql/new
2. Copy/paste contents of `sql/009_community_hardening.sql`
3. Click Run
4. Verify with:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'create_community_group','join_community_group','leave_community_group',
       'delete_community_group','update_group_member_role','accept_invite',
       'get_invite_details','_sync_group_member_count'
     )
   ORDER BY routine_name;
   ```
   Should return 8 rows.
5. Backfill member_count:
   ```sql
   UPDATE public.groups g
   SET member_count = (SELECT COUNT(*) FROM public.group_members WHERE group_id = g.id);
   ```

---

## Next Steps for Following Agent

1. **Apply Supabase migration** (see instructions above)
2. **Trigger GitHub Actions build** — push any commit to `main` or use workflow_dispatch
3. **Update isotope-apk pinned commit** in `.github/workflows/android.yml` `ISOTOPE_CODE_REF`
   to pick up any isotope-code changes since `fd39fad`
4. **Two-account integration test** — see `.agent/NEXT_TASKS.md` TASK ANDROID-013
5. **Android App Links** (optional) — add `assetlinks.json` to isotopeai.in for verified
   HTTPS deep links. Custom scheme `isotopeai://` works without this.
6. **Frontend source update** — isotope-code `src/` hooks still use direct table inserts.
   Long-term: update hooks to call RPCs. Short-term: the compiled bundles are what ships.

---

## Important Test Scope

- Code written: YES
- Unit/patch-contract tested: YES — **47/47 Node tests**
- Local Capacitor sync/build script: YES (prepare-www + apply-patches)
- Local Gradle/APK build: SKIPPED (use GitHub Actions)
- CI APK build: PENDING (awaiting Actions run on new commits)
- Emulator tested: NOT YET
- Physical-device tested: NOT YET
