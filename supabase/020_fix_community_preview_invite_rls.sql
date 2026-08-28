-- 020_fix_community_preview_invite_rls.sql
--
-- Buddy invite links always previewed as "invalid" — for perfectly valid tokens.
--
-- ROOT CAUSE (verified live on prod before writing this):
--
--   buddy_invites has RLS ENABLED with ZERO policies:
--       buddy_invites   rls=true  policies=0
--   which is fail-closed: no row is visible to anon or authenticated.
--
--   Its three consumers do not agree on how they read it:
--       community_create_invite    SECURITY DEFINER  -> RLS bypassed, works
--       community_redeem_invite    SECURITY DEFINER  -> RLS bypassed, works
--       community_preview_invite   INVOKER RIGHTS    -> reads NOTHING
--
--   So a buddy invite can be created and redeemed but never previewed. Worse,
--   preview_invite fails SILENTLY: its buddy SELECT lands in `res`, `res` stays
--   NULL, and control falls through to the group-invite branch, which does not
--   match either — so the caller gets {"status":"invalid"} for a valid token.
--   Reproduced through PostgREST with the anon key:
--       community_preview_invite('<any token>') -> 200 {"status": "invalid"}
--
-- WHY SECURITY DEFINER RATHER THAN A NEW POLICY:
--
--   A preview is deliberately PRE-AUTHORISATION. The caller holds a secret token
--   and is by definition not yet a buddy or group member, so there is no
--   relationship for a policy to test. Any policy permissive enough to allow the
--   preview would have to be effectively "anyone may read any invite row", which
--   is weaker than a definer function that returns only the four display fields
--   for one token. This also makes all three invite functions consistent, which
--   is what let the discrepancy hide in the first place.
--
--   Token secrecy is the access control, exactly as it already is for the
--   group-invite branch of this same function.
--
-- SCOPE OF THE PRIVILEGE CHANGE: the body is otherwise unchanged. It reads
-- buddy_invites, group_invites, groups, group_members and user_profiles, and
-- returns only: status, type, inviterId/targetId, name, handle, avatarUrl,
-- exam, targetYear, subjects, memberCount, isFull. No token is echoed back, no
-- write of any kind, no email or auth data. The other four tables it touches
-- already carry policies (7/12/11/2), so widening to definer rights does not
-- expose anything that a member could not already read.
--
-- Also adds an explicit expiry/uses guard comment: the WHERE clause already
-- filters expires_at and max_uses, and that behaviour is preserved verbatim.
--
-- SAFETY: CREATE OR REPLACE of one function. No table, column, row, or policy is
-- touched. STABLE (read-only). Reversible via
-- supabase/_rollback_community_preview_invite.sql.

CREATE OR REPLACE FUNCTION public.community_preview_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  res jsonb;
begin
  -- Buddy invite. Requires definer rights: buddy_invites is RLS-enabled with no
  -- policies, so an invoker-rights read here returns nothing and the whole
  -- function falls through to report "invalid".
  select jsonb_build_object(
    'status', 'valid',
    'type', 'buddy',
    'inviterId', b.inviter_id,
    'name', coalesce(nullif(up.display_name, ''), 'Someone'),
    'handle', coalesce(up.handle, ''),
    'avatarUrl', null,
    'isFull', false
  ) into res
  from public.buddy_invites b
  left join public.user_profiles up on up.user_id = b.inviter_id
  where b.token = p_token
    and (b.expires_at is null or b.expires_at > now())
    and (b.max_uses is null or b.uses_count < b.max_uses)
  limit 1;
  if res is not null then
    return res;
  end if;

  -- Group invite.
  select jsonb_build_object(
    'status', 'valid',
    'type', 'group',
    'targetId', g.id,
    'name', g.name,
    'exam', coalesce(g.exam, ''),
    'targetYear', coalesce(g.target_year, 0),
    'subjects', coalesce(g.subjects, '{}'::text[]),
    'memberCount', (select count(*) from public.group_members a where a.group_id = g.id and a.left_at is null),
    'isFull', (select count(*) from public.group_members a where a.group_id = g.id and a.left_at is null) >= 30
  ) into res
  from public.group_invites inv
  join public.groups g on g.id = inv.group_id and g.deleted_at is null
  where inv.token = p_token
    and (inv.expires_at is null or inv.expires_at > now())
    and (inv.max_uses is null or inv.uses_count < inv.max_uses)
  limit 1;
  -- Tail kept byte-faithful to the live definition (verified by normalised
  -- diff) so this migration changes privileges ONLY, not behaviour.
  if res is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return res;
end
$function$;

GRANT EXECUTE ON FUNCTION public.community_preview_invite(text) TO anon, authenticated;
