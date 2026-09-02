-- 023_wire_missing_storage_buckets.sql
--
-- Two buckets the app actively uploads to do not exist. Every group-icon and
-- every study-material upload has been failing with 404.
--
-- ============================================================================
-- EVIDENCE (measured on prod, ollsqiutzartjhiuzkbf)
-- ============================================================================
--
--   GET /storage/v1/bucket  ->  user-content, avatars, notes      (3)
--
--   POST /storage/v1/object/group-icons/probe/test.png
--     -> 400 {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
--   POST /storage/v1/object/study-material/probe/test.png
--     -> 400 {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
--
-- But the shipped bridge uploads to both:
--
--   www/android-bridge.js:2479  storageUploadObject('group-icons',    …)
--   www/android-bridge.js:2512  storageUploadObject('study-material', …)
--   www/android-bridge.js:5306  groupIcons:    { bucket: 'group-icons',    public: true  }
--   www/android-bridge.js:5307  studyMaterial: { bucket: 'study-material', public: false }
--
-- reached through /__auth/storage/group-icon and /__auth/storage/study-material.
-- So setting a group icon and attaching study material both fail on every
-- attempt, for every user, and have done since those endpoints shipped.
--
-- supabase/create_android_storage_buckets.sql already contains the correct
-- definitions and was applied to `vteqquoqvksshmfhuepu` on 2026-07-01 — the
-- PREVIOUS project. It was never applied to the current one after migration.
-- That file is left in place as the historical record; this migration is what
-- actually reconciles the live project, and unlike that file it is safe to run
-- repeatedly and asserts the outcome.
--
-- ============================================================================
-- WHY THE BACKUP DID NOT REVEAL IT
-- ============================================================================
--
-- The backup dumps buckets that EXIST. A bucket the code needs and the database
-- lacks is invisible to a tool whose reference point is the database. Verification
-- compared 3 manifest buckets against 3 live buckets and passed.
--
-- Fixed structurally as well as here: the bucket list is now declared once, in
-- scripts/supabase-backup.mjs REQUIRED_BUCKETS, restore creates every required
-- bucket rather than only those present in the manifest, and verify fails when
-- one is missing. So a restored project can accept a group-icon upload even
-- though the source project could not.
--
-- ============================================================================
-- PATH CONTRACT (enforced by the policies below)
-- ============================================================================
--
--   group-icons     {auth.uid()}/groups/{group_id-or-slug}/{file}
--   study-material  {auth.uid()}/study-material/{subject-or-chapter}/{file}
--
-- The first path segment is the owner's uid, which is what makes an owner-scoped
-- policy expressible: (storage.foldername(name))[1] = auth.uid()::text. The
-- bridge already builds paths this way (android-bridge.js:2511), so the policies
-- match what it uploads.
--
-- group-icons is PUBLIC read: a group icon is rendered for anyone browsing
-- Discover, including users who are not members and unauthenticated visitors, so
-- a signed URL per icon per render would be the wrong shape. Writes are still
-- owner-scoped — public read does not mean public write.
--
-- study-material is PRIVATE in every direction. It holds a student's own notes
-- and PDFs; nothing outside their own folder is readable.
--
-- ============================================================================
-- SAFETY
-- ============================================================================
-- Idempotent: ON CONFLICT DO UPDATE for buckets, DROP POLICY IF EXISTS before
-- each CREATE. Creates no objects and deletes none. Rollback in
-- _rollback_storage_buckets.sql, which drops the policies but deliberately does
-- NOT drop the buckets — that would delete real user files.

BEGIN;

-- ── buckets ─────────────────────────────────────────────────────────────────
-- Limits are deliberate rather than default:
--   group-icons     10 MB — an icon; anything larger is a mistake, and the
--                   allowed_mime_types list makes a non-image upload fail at the
--                   storage layer instead of rendering as a broken image later.
--   study-material 100 MB — a scanned PDF of a chapter genuinely reaches tens of
--                   MB. mime is left NULL: students attach PDFs, images, audio
--                   and archives, and an allow-list here would reject real work.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('group-icons',    'group-icons',    true,   10485760,
     ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('study-material', 'study-material', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── group-icons policies ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "group_icons_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "group_icons_owner_insert"  ON storage.objects;
DROP POLICY IF EXISTS "group_icons_owner_update"  ON storage.objects;
DROP POLICY IF EXISTS "group_icons_owner_delete"  ON storage.objects;

CREATE POLICY "group_icons_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'group-icons');

CREATE POLICY "group_icons_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'group-icons'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "group_icons_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'group-icons'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'group-icons'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "group_icons_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'group-icons'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ── study-material policies ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "study_material_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "study_material_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "study_material_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "study_material_owner_delete" ON storage.objects;

CREATE POLICY "study_material_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'study-material'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "study_material_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'study-material'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "study_material_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'study-material'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'study-material'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "study_material_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'study-material'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ── assert ──────────────────────────────────────────────────────────────────
-- A missing bucket is the exact failure this file fixes, and it fails at upload
-- time rather than here, so confirm the outcome before reporting success.

DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(b, ', ') INTO v_missing
    FROM unnest(ARRAY['user-content','avatars','group-icons','study-material']) b
   WHERE NOT EXISTS (SELECT 1 FROM storage.buckets s WHERE s.id = b);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'bucket(s) still missing after migration: %', v_missing;
  END IF;

  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
         AND policyname LIKE 'group_icons%') <> 4 THEN
    RAISE EXCEPTION 'group-icons policies incomplete';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
         AND policyname LIKE 'study_material%') <> 4 THEN
    RAISE EXCEPTION 'study-material policies incomplete';
  END IF;

  RAISE NOTICE 'all 5 buckets present with owner-scoped policies';
END $$;

COMMIT;
