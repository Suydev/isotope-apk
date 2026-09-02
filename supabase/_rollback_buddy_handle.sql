-- _rollback_buddy_handle.sql
--
-- Reverts 021_fix_buddy_handle_and_overview.sql to the definitions that were
-- live before it, verified by pg_get_functiondef on prod before the migration
-- was written.
--
-- NOT reverted: the handle backfill. Restoring NULL handles would re-break buddy
-- lookup for every account, which is the bug 021 exists to fix, and the values
-- written are derived from data the users already own (their own JSONB handle or
-- username) rather than invented. If you genuinely need the column empty again:
--     UPDATE public.user_profiles SET handle = NULL;
-- and be aware that ux_profiles_handle then indexes nothing and
-- community_request_buddy raises user_not_found for every handle.

BEGIN;

CREATE OR REPLACE FUNCTION public.community_bootstrap_profile(
  p_display_name text,
  p_handle text DEFAULT NULL::text,
  p_day_offset_hours integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  UPDATE public.user_profiles
  SET profile_data = jsonb_set(
    COALESCE(profile_data, '{}'),
    '{community_enrolled}',
    'true'
  ),
  profile_data = jsonb_set(
    profile_data,
    '{community_handle}',
    to_jsonb(p_handle)
  ),
  profile_data = jsonb_set(
    profile_data,
    '{community_display_name}',
    to_jsonb(p_display_name)
  ),
  profile_data = jsonb_set(
    profile_data,
    '{community_day_offset_hours}',
    to_jsonb(p_day_offset_hours)
  )
  WHERE user_id = v_uid;
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.community_request_buddy(p_handle text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  fid uuid;
  cid uuid;
begin
  select user_id into fid from public.user_profiles where lower(handle) = lower(p_handle) limit 1;
  if fid is null then raise exception 'user_not_found'; end if;
  if fid = uid then raise exception 'cannot_be_self'; end if;
  begin
    insert into public.community_friends (user_id, friend_id, status, created_at, updated_at)
    values (uid, fid, 'pending', now(), now())
    returning id into cid;
  exception when unique_violation then
    null;
  end;
  select id into cid from public.community_friends
   where (user_id = uid and friend_id = fid)
      or (user_id = fid and friend_id = uid)
   limit 1;
  return cid;
end
$function$;

CREATE OR REPLACE FUNCTION public.community_get_overview()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$

  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalGroups', (SELECT COUNT(*) FROM public.groups WHERE deleted_at IS NULL),
      'totalMembers', (SELECT COUNT(DISTINCT user_id) FROM public.group_members),
      'totalMessages', 0
    ),
    'groups', (SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'slug', lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g')),
      'memberCount', (SELECT COUNT(*) FROM public.group_members WHERE group_id = g.id),
      'activeNow', 0, 'visualKey', visual_key, 'exam', exam
    )) FROM public.groups g WHERE deleted_at IS NULL)
  );
$function$;

COMMIT;
