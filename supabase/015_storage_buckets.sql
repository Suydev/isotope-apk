-- 015_storage_buckets.sql — Storage buckets + owner-scoped RLS (2026-08-21)
-- Session changes: buckets were missing on fresh projects → sync failed with
-- "Bucket not found". This migration is idempotent; run on any project.
--
-- Buckets:
--   user-content  50 MB, private  — canonical backups, cloud snapshots, imports
--   avatars        2 MB, public   — profile avatars (images only)
--   notes         10 MB, private  — study material
--
-- Auth config applied via Management API this session (NOT SQL — recorded here
-- for restore docs): jwt_exp=604800 (7d max), refresh_token_rotation_enabled=false,
-- uri_allow_list includes https://localhost/** + capacitor://localhost/** + isotopeai://**

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('user-content','user-content',false,52428800,NULL),
  ('avatars','avatars',true,2097152,ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('notes','notes',false,10485760,NULL)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owner-scoped access: first path segment must equal auth.uid()
DROP POLICY IF EXISTS "user-content owner read"   ON storage.objects;
DROP POLICY IF EXISTS "user-content owner write"  ON storage.objects;
DROP POLICY IF EXISTS "user-content owner update" ON storage.objects;
DROP POLICY IF EXISTS "user-content owner delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars public read"       ON storage.objects;
DROP POLICY IF EXISTS "avatars owner write"       ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update"      ON storage.objects;
DROP POLICY IF EXISTS "avatars owner delete"      ON storage.objects;
DROP POLICY IF EXISTS "notes owner all"           ON storage.objects;

CREATE POLICY "user-content owner read" ON storage.objects FOR SELECT
  USING (bucket_id='user-content' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user-content owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='user-content' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user-content owner update" ON storage.objects FOR UPDATE
  USING (bucket_id='user-content' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user-content owner delete" ON storage.objects FOR DELETE
  USING (bucket_id='user-content' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars public read" ON storage.objects FOR SELECT
  USING (bucket_id='avatars');
CREATE POLICY "avatars owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='avatars' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars owner update" ON storage.objects FOR UPDATE
  USING (bucket_id='avatars' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars owner delete" ON storage.objects FOR DELETE
  USING (bucket_id='avatars' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "notes owner all" ON storage.objects FOR ALL
  USING (bucket_id='notes' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id='notes' AND auth.role()='authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);
