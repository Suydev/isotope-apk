-- 018_fix_legacy_create_group_overload.sql
-- PostgREST PGRST203: Could not choose the best candidate function between
--  public.create_community_group(p_name=>text,p_description=>text,p_category=>text,p_cover_url=>text,p_is_public=>boolean,p_max_members=>integer,p_visibility=>text)
--  public.create_community_group(p_name=>text,p_description=>text,p_category=>text,p_is_public=>boolean,p_slug=>text,p_logo_url=>text,p_cover_url=>text,p_settings=>jsonb)
-- The app actually calls community_create_group (with prefix, signature p_name,p_description,p_exam,p_target_year,p_subjects,p_visibility,p_join_policy,p_timezone_offset_minutes)
-- which is correct and works. The legacy create_community_group (without prefix) overloads are unused and only pollute the PostgREST schema cache.
-- Drop them for hygiene.

DROP FUNCTION IF EXISTS public.create_community_group(p_name text, p_description text, p_category text, p_cover_url text, p_is_public boolean, p_max_members integer, p_visibility text);
DROP FUNCTION IF EXISTS public.create_community_group(p_name text, p_description text, p_category text, p_is_public boolean, p_slug text, p_logo_url text, p_cover_url text, p_settings jsonb);
