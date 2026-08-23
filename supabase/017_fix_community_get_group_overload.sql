-- 017_fix_community_get_group_overload.sql
-- PostgREST error: "Could not choose the best candidate function between:
--  public.community_get_group(p_group_id => text, p_period => text),
--  public.community_get_group(p_group_id => uuid, p_period => text)"
-- The app calls community_get_group with {p_group_id: uuid_string, p_period: text}.
-- PostgREST cannot resolve which overload to use when the JSON value is a string
-- that could be text or uuid. The text overload is more flexible: it tries
-- uuid cast and falls back to slug lookup, handling both cases. The uuid overload
-- is redundant and strictly less capable. Drop it.

DROP FUNCTION IF EXISTS public.community_get_group(p_group_id uuid, p_period text);
