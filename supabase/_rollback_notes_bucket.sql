-- _rollback_notes_bucket.sql
--
-- Reverts 024_drop_unused_notes_bucket.sql: recreates the `notes` bucket and its
-- owner-scoped policy exactly as they were.
--
-- It cannot recreate objects. 024 refuses to drop a non-empty bucket precisely so
-- that this limitation never matters — if it ran, the bucket was empty.
--
-- Only worth running if a feature is added that actually writes to `notes`. If
-- that happens, add it to REQUIRED_BUCKETS in scripts/supabase-setup.mjs and
-- scripts/supabase-backup.mjs at the same time, or new projects will not get it.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('notes', 'notes', false, 10485760, NULL)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "notes owner all" ON storage.objects;
CREATE POLICY "notes owner all" ON storage.objects
  FOR ALL TO public
  USING (bucket_id = 'notes'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'notes'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
