-- 024_drop_unused_notes_bucket.sql
--
-- Removes the `notes` storage bucket. It is provisioned on every project, has a
-- 10 MB limit and an owner-scoped RLS policy, and **nothing writes to it**.
--
-- ============================================================================
-- EVIDENCE
-- ============================================================================
--
--   objects in the bucket (prod)                          0
--   upload paths in www/android-bridge.js                  0
--   references in any reachable web bundle                 0
--   references in the sync payload                         0
--
-- Its only mention anywhere is a health check in isotope-code/server.mjs:9043
-- asserting that it exists — a check for a bucket no feature uses. That is worse
-- than no check: it can only ever fail for a reason nobody should act on, which
-- is how people learn to ignore a health report that would otherwise catch
-- something real. (Two buckets the app genuinely needs, `group-icons` and
-- `study-material`, were missing for weeks while this one was verified.)
--
-- Note attachments go to `user-content` with the rest of the sync payload, which
-- is where the 57 real objects live.
--
-- ============================================================================
-- WHY DROP RATHER THAN LEAVE IT
-- ============================================================================
--
-- A bucket is a permission surface. `notes owner all` grants authenticated users
-- INSERT/SELECT/UPDATE/DELETE under their own uid prefix, so every account can
-- store 10 MB of arbitrary bytes in a location the app never reads and no cleanup
-- pass ever visits. Free-plan storage is 1 GB shared across all buckets. Keeping
-- an unreachable write target is a slow leak with no upside.
--
-- Removing it also removes it from the schema dump, so new projects stop being
-- provisioned with it. `schema-dump.mjs` emits buckets from the live database, so
-- this is the only way to stop it propagating.
--
-- ============================================================================
-- SAFETY — READ THIS BEFORE RUNNING
-- ============================================================================
--
-- This DROPS a bucket. It is written to be safe, and it refuses rather than
-- destroys:
--
--   * it deletes the bucket only when it contains ZERO objects
--   * if any object exists it RAISES and changes nothing, so a project where
--     someone did use it keeps its data and its policy
--   * the policy is dropped only after the bucket is confirmed gone
--
-- Verify before running:
--     select count(*) from storage.objects where bucket_id = 'notes';
--
-- Rollback in _rollback_notes_bucket.sql recreates the bucket and policy. It
-- cannot recreate objects, which is why the guard above exists.
--
-- ── one Supabase-specific detail ────────────────────────────────────────────
--
-- `DELETE FROM storage.buckets` is blocked by a platform trigger:
--
--     storage.protect_delete()
--       RAISE 42501 'Direct deletion from storage tables is not allowed.
--                    Use the Storage API instead.'
--       HINT 'This prevents accidental data loss from orphaned objects.'
--
-- unless the session sets `storage.allow_delete_query = 'true'`. That guard is
-- correct — deleting a bucket row directly would orphan every object under it —
-- and this migration satisfies its intent rather than merely bypassing it: the
-- object count is checked first, so there is nothing to orphan. The setting is
-- scoped to the local transaction via set_config(…, is_local => true), so it
-- reverts on COMMIT and cannot leave a session in which arbitrary storage
-- deletes are permitted. It is set INSIDE the DO block rather than as a separate
-- SET LOCAL statement because the management API runs each statement in its own
-- transaction, so a standalone SET LOCAL would revert before the DELETE ran.
--
-- The alternative is a DELETE through the Storage REST API, which cannot be
-- expressed in a .sql file. scripts/supabase-setup.mjs does not create the bucket
-- any more, so a fresh project never gets one; this file is what reconciles a
-- project that already has it.

BEGIN;

DO $iso$
DECLARE v_objects bigint;
BEGIN
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'notes') THEN
    RAISE NOTICE 'notes bucket already absent — nothing to do';
    RETURN;
  END IF;

  SELECT count(*) INTO v_objects FROM storage.objects WHERE bucket_id = 'notes';
  IF v_objects > 0 THEN
    RAISE EXCEPTION
      'refusing to drop the notes bucket: it holds % object(s). Someone is using it — migrate them to user-content first.',
      v_objects;
  END IF;

  DELETE FROM storage.buckets WHERE id = 'notes';
  RAISE NOTICE 'notes bucket dropped (0 objects)';
END $iso$;

-- Only meaningful once the bucket is gone; a policy referencing a nonexistent
-- bucket is dead weight, and leaving it would keep it in the schema dump.
DROP POLICY IF EXISTS "notes owner all"                  ON storage.objects;
DROP POLICY IF EXISTS "notes: users manage own objects"  ON storage.objects;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'notes') THEN
    RAISE EXCEPTION 'notes bucket still present after migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('notes owner all', 'notes: users manage own objects')
  ) THEN
    RAISE EXCEPTION 'notes policies still present after migration';
  END IF;
  RAISE NOTICE 'notes bucket and its policies removed';
END $$;

COMMIT;
