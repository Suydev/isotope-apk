-- 022_restore_signup_trigger.sql
--
-- Every new account is invisible to the app, because the signup trigger does not
-- exist. handle_new_user() is present and correct; nothing calls it.
--
-- ============================================================================
-- EVIDENCE (measured on prod, ollsqiutzartjhiuzkbf)
-- ============================================================================
--
--     select count(*) from auth.users;    ->  43
--     select count(*) from public.users;  ->  11
--     auth users with no public.users row ->  32
--
--     select tgname from pg_trigger where tgname = 'on_auth_user_created';  ->  []
--     select proname from pg_proc where proname = 'handle_new_user';        ->  1 row
--
-- The function exists. The trigger that fires it does not. So 32 of 43 accounts
-- have an auth identity and nothing else: no public.users row, no user_profiles,
-- no user_points, no user_stats_summary, no user_presence.
--
-- ============================================================================
-- WHY THIS IS THE ROOT CAUSE OF SEVERAL "BROKEN FEATURE" REPORTS
-- ============================================================================
--
-- handle_new_user() is what seeds the five rows the app assumes exist. Without
-- it, on a freshly created account:
--
--   * community_bootstrap_profile fails 409 23503 —
--       "Key (user_id)=(…) is not present in table \"users\""
--     via tr_sync_user_onboarding_from_profile, because user_onboarding FKs to
--     public.users. Reproduced end-to-end with two real JWTs on the restored
--     test project: enrolment failed for both users before this trigger existed,
--     and succeeded for both immediately after it was created. Nothing else
--     changed between the two runs.
--   * every buddy lookup then fails, because there is no user_profiles row to
--     hold a handle. This is why `select count(*) from user_profiles` returned 0
--     on a project with dozens of accounts, and why ux_profiles_handle indexes a
--     column nothing populates.
--   * the leaderboard, presence and points all read tables that have no row for
--     the user.
--
-- So the buddy handle mismatch fixed in 021 was real, but it was the SECOND
-- defect in the chain. A user who never got a user_profiles row cannot have a
-- handle in either location.
--
-- ============================================================================
-- WHY IT IS MISSING, AND WHY THE BACKUP DID NOT CARRY IT
-- ============================================================================
--
-- The trigger lives on auth.users. scripts/supabase-backup.mjs excludes the
-- `auth` schema from its inventory (EXCLUDE_SCHEMAS), which is right for TABLES
-- — auth.users rows are dumped separately and auth's own schema is managed by
-- Supabase — but it also means a trigger attached to an auth table is never
-- captured. The manifest lists 14 triggers, all on public tables:
--
--     public.users.trg_ensure_community_enrollment
--     public.users.trg_ensure_onboarding
--     …
--
-- Note what those are: they fire on INSERT INTO public.users. They are the
-- SECOND stage. The first stage — auth.users -> public.users — is the one that
-- was lost. So every restore produced a database that looked complete (94/94
-- verification checks passed, all 14 triggers present) and could not accept a
-- signup. The verifier could not catch it either, because it only checks what the
-- manifest recorded.
--
-- Fixed in two places: this migration restores the trigger, and the backup tool
-- now inventories triggers on auth.users so a future restore carries it.
--
-- ============================================================================
-- SAFETY
-- ============================================================================
-- Idempotent: DROP TRIGGER IF EXISTS then CREATE. The backfill is a guarded
-- INSERT … ON CONFLICT DO NOTHING and touches only auth users that have no
-- public.users row, so it cannot alter an existing account. Rollback in
-- _rollback_signup_trigger.sql.
--
-- Requires the postgres role (owner of auth.users). The Supabase management API
-- query endpoint runs as postgres, so applying through the dashboard SQL editor
-- or `backup.sh` works; a plain anon/service PostgREST call will not.

BEGIN;

-- ── 1. the missing trigger ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. backfill the 32 accounts that were created while it was absent ────────
--
-- Same column set and same defaults as handle_new_user(), so a backfilled row is
-- indistinguishable from a trigger-created one. Username derivation matches the
-- function exactly: metadata username, else the local part of the email, else a
-- short id — otherwise a backfilled account would get a different handle than the
-- same signup would produce today.

INSERT INTO public.users (id, email, name, username, plan_type, billing_status, plan_expires_at, access_ends_at)
SELECT a.id,
       COALESCE(a.email, COALESCE(
         NULLIF(btrim(a.raw_user_meta_data->>'username'), ''),
         'user_' || left(a.id::text, 8)) || '@isotope.local'),
       COALESCE(NULLIF(btrim(a.raw_user_meta_data->>'name'), ''),
                NULLIF(btrim(a.raw_user_meta_data->>'username'), ''),
                NULLIF(split_part(COALESCE(a.email, ''), '@', 1), ''),
                'user_' || left(a.id::text, 8)),
       COALESCE(NULLIF(btrim(a.raw_user_meta_data->>'username'), ''),
                NULLIF(split_part(COALESCE(a.email, ''), '@', 1), ''),
                'user_' || left(a.id::text, 8)),
       'ranker', 'active',
       '2099-12-31 23:59:59+00', '2099-12-31 23:59:59+00'
  FROM auth.users a
 WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
ON CONFLICT (id) DO NOTHING;

-- The four dependent rows. Driven off public.users rather than auth.users so
-- this also repairs an account whose users row exists but whose satellites are
-- missing — the state left by a restore that failed partway through the data
-- phase.
INSERT INTO public.user_profiles (user_id, profile_data)
SELECT u.id, '{}'::jsonb FROM public.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_points (user_id, points, lifetime_points)
SELECT u.id, 0, 0 FROM public.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_stats_summary (user_id, total_study_seconds, streak_days, max_streak_days, session_count)
SELECT u.id, 0, 0, 0, 0 FROM public.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_presence (user_id, status, last_seen)
SELECT u.id, 'offline', now() FROM public.users u
ON CONFLICT (user_id) DO NOTHING;

-- ── 3. assert, rather than assume ────────────────────────────────────────────
-- A silently-missing trigger is exactly the failure this file exists to fix, so
-- do not let the migration report success without it.

DO $$
DECLARE v_missing bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'on_auth_user_created'
       AND tgrelid = 'auth.users'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'on_auth_user_created was not created on auth.users';
  END IF;

  SELECT count(*) INTO v_missing
    FROM auth.users a
   WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % auth user(s) still have no public.users row', v_missing;
  END IF;

  RAISE NOTICE 'signup trigger restored; every auth user has a public.users row';
END $$;

COMMIT;
