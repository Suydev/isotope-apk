-- _rollback_signup_trigger.sql
--
-- Reverts 022_restore_signup_trigger.sql.
--
-- Dropping this trigger restores the broken state deliberately: new signups will
-- again receive an auth identity and no public.users row, enrolment will fail
-- 409 23503, and buddy lookup will fail for those accounts. Only useful if the
-- trigger is proven to be causing signup failures itself — in which case fix
-- handle_new_user() rather than leaving signup half-completed.
--
-- The backfilled rows are NOT removed. They are the rows the trigger would have
-- created, they are referenced by user_profiles / user_points /
-- user_stats_summary / user_presence, and deleting them would cascade into real
-- user data. If a specific test account must go, delete it from auth.users and
-- let the existing FK cascades handle the rest.

BEGIN;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DO $$ BEGIN
  RAISE NOTICE 'on_auth_user_created dropped — new signups will NOT get a public.users row';
END $$;

COMMIT;
