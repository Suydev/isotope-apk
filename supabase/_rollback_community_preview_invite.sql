-- Captured from prod 2026-08-28T13:37:05.918Z before applying 020.
-- Restores the previous (invoker-rights) definition if ever needed.

CREATE OR REPLACE FUNCTION public.community_preview_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  res jsonb;
begin
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
  if res is null then return jsonb_build_object('status', 'invalid'); end if;
  return res;
end $function$
;
