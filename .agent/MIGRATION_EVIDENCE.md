# Migration evidence — vteqquoqvksshmfhuepu (prod)
Date: 2026-08-14 (restore/validation session)

Sources of truth:
  isotope-code/sql/isotope-schema-restore.sql  (portable schema, 4244 lines)
  isotope-code/backups/isotope-backup-20260815-092119.tar.gz  (fresh, good backup)
  /data/data/com.termux/files/home/isotope-apk/supabase/*.sql  (deployable migrations)

## Restore method
  ./backup.sh restore <tarball> --supabase-url=$(SUPABASE_URL) --pat=$(PAT)
  with the real service-role key (fixed .env: sukki -> SUPABASE_SERVICE_ROLE_KEY).

## Gate: 011 join-guard + 014 join_policy applied to prod (idempotent no-ops)
- supabase/011_community_join_guard.sql  -> applied via psql, 0 errors
  function public.community_join_group exists (guard v2: owner/member -> {"status":"member"}).
- supabase/014_join_policy_join_requests.sql -> applied via psql:
  NOTICE: column "join_policy" of relation "groups" already exists, skipping
  NOTICE: relation "community_join_requests" already exists, skipping
- supabase/011_fix_rls_recursion.sql -> converted to a no-op redirect (renamed
  upstream to 011_community_join_guard.sql) to avoid duplicate execution.

## Gate: RPC contract (prod) — all 32 bundle RPCs present
- `www/assets/SingleGroup-DU1IhoNK.js:.rpc("get_group_analytics_from_snapshots"`
- `www/assets/Subscription-CZ7GSv7S.js:.rpc("get_membership_snapshot"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_bootstrap_profile"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_create_group"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_create_invite"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_delete_group"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_discover_groups"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_get_group"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_get_overview"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_get_privacy"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_get_start_alert"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_heartbeat"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_is_enrolled"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_join_group"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_leave_group"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_preview_invite"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_redeem_invite"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_remove_buddy"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_remove_group_member"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_request_buddy"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_respond_buddy"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_respond_join_request"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_save_privacy"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_set_group_role"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_set_start_alert"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_submit_report"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_transfer_group"`
- `www/assets/communityApi-Ccw5N_9O.js:.rpc("community_update_group"`
- `www/assets/messaging-GqxsLPbk.js:.rpc("community_register_device_token"`
- `www/assets/useAuthStore-Aw1au7RF.js:.rpc("get_membership_snapshot"`
- `www/assets/useInvites-D9RLFwf8.js:.rpc("accept_invite"`
- `www/assets/useInvites-D9RLFwf8.js:.rpc("get_invite_details"`
- `www/assets/useNotificationStore-BTREori0.js:.rpc("community_sync_quiet_hours"`
=> 32/32 present in pg_proc (verified with psql).

## Gate: data (prod)
- auth.users=49 (34 real + 15 placeholder rows for stale orphaned FK refs)
- public.users=49, groups=18 (all have join_policy), group_members=41,
  user_onboarding=31, tasks=10, focus_sessions=19,
  community_join_requests=6, storage.objects=67.

## Tooling fixes applied this session
- scripts/supabase-backup.mjs topoSort: keyOf(t) instead of undefined t.key
  (root cause of manifests with fk_order=[1 entry]).
- scripts/supabase-backup.mjs: storage upload now sends correct Content-Type
  (avatars/group-icons buckets reject application/octet-stream -> 415).
- scripts/supabase-backup.mjs: storage uploads retry on transient fetch failures.
- scripts/supabase-backup.mjs: restore appends tables missing from a degenerate
  manifest.fk_order (defense-in-depth).
- backup.sh: service-key typo detection (sukki fallback), post-backup manifest
  validation, and .env key preservation on restore-to-same-project.
- backup.sh restore: .env scaffold no longer wipes GITHUB_PAT/SESSION_SECRET/etc.

## Known limits
- schema.sql restore via the Supabase Management API breaks PL/pgSQL function
  bodies (dollar-quote splitting); production restores must use psql (this session
  did). Tracked in plan.md Phase 5 for deploy-supabase.js (which will prefer pgrest
  or psql over the Management SQL endpoint).
