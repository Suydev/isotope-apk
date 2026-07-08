-- ============================================================================
-- IsotopeAI Android — Consolidated Supabase setup (idempotent)
-- ============================================================================
-- Combines, in safe order:
--   1. create_android_storage_buckets.sql   (storage buckets + RLS policies)
--   2. repair_android_community_api_grants.sql (table grants for the Data API)
--   3. repair_invite_rpc_slug_contract.sql  (invite RPC response contract)
--
-- PREREQUISITE: the base schema (tables like public.groups, public.group_members,
-- public.group_invites, public.user_points, etc. and community migrations 009/010)
-- comes from the isotope-code repo. Apply those migrations FIRST.
-- This script is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Storage buckets + policies
--    Path contract:
--      group-icons:    {auth.uid()}/groups/{group_id-or-slug}/{file}
--      study-material: {auth.uid()}/study-material/{subject-or-chapter}/{file}
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('group-icons', 'group-icons', true, 10485760, array['image/png','image/jpeg','image/webp','image/gif']),
  ('study-material', 'study-material', false, 104857600, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group_icons_public_read" on storage.objects;
drop policy if exists "group_icons_owner_insert" on storage.objects;
drop policy if exists "group_icons_owner_update" on storage.objects;
drop policy if exists "group_icons_owner_delete" on storage.objects;
drop policy if exists "study_material_owner_select" on storage.objects;
drop policy if exists "study_material_owner_insert" on storage.objects;
drop policy if exists "study_material_owner_update" on storage.objects;
drop policy if exists "study_material_owner_delete" on storage.objects;

create policy "group_icons_public_read" on storage.objects
  for select to public
  using (bucket_id = 'group-icons');

create policy "group_icons_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'group-icons' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "group_icons_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'group-icons' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'group-icons' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "group_icons_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'group-icons' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "study_material_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-material' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "study_material_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-material' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "study_material_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'study-material' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'study-material' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "study_material_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-material' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ----------------------------------------------------------------------------
-- 2. Data API grants required by the compiled Android web bundle.
--    RLS policies still enforce ownership/admin rules; these grants only allow
--    authenticated clients to reach the policy checks instead of failing early.
-- ----------------------------------------------------------------------------

grant update on public.group_challenge_participants to authenticated;
grant insert, update, delete on public.user_inventory to authenticated;
grant insert, update on public.user_points to authenticated;
grant update on public.group_members to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Invite RPC response contract (routeable group slug after accepting invite)
-- ----------------------------------------------------------------------------

create schema if not exists rpc_private;

create or replace function rpc_private.accept_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invite public.group_invites%rowtype;
  v_group_slug text;
  v_uid uuid := (select auth.uid());
  v_inserted boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select gi.*
  into v_invite
  from public.group_invites gi
  where gi.token = p_code or gi.invite_code = p_code
  order by gi.created_at desc nulls last
  limit 1
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invite not found');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    return jsonb_build_object('success', false, 'error', 'Invite has expired');
  end if;
  if v_invite.max_uses is not null
     and coalesce(v_invite.uses_count, 0) >= v_invite.max_uses then
    return jsonb_build_object('success', false, 'error', 'Invite has reached maximum uses');
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;
  v_inserted := found;

  if v_inserted then
    update public.group_invites
    set uses_count = coalesce(uses_count, 0) + 1,
        invite_code = coalesce(invite_code, token),
        token = coalesce(token, invite_code)
    where id = v_invite.id;
  end if;

  select g.slug
  into v_group_slug
  from public.groups g
  where g.id = v_invite.group_id;

  return jsonb_build_object(
    'success', true,
    'ok', true,
    'group_id', v_invite.group_id,
    'group_slug', coalesce(v_group_slug, v_invite.group_id::text),
    'slug', coalesce(v_group_slug, v_invite.group_id::text),
    'already_member', not v_inserted
  );
end;
$function$;

drop function if exists public.get_invite_details(text);
drop function if exists rpc_private.get_invite_details(text);

create function rpc_private.get_invite_details(p_code text)
returns table(
  group_id uuid,
  group_slug text,
  group_name text,
  description text,
  member_count bigint,
  is_valid boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    g.id,
    g.slug,
    g.name,
    g.description,
    count(gm.user_id),
    (
      (gi.expires_at is null or gi.expires_at > now())
      and (gi.max_uses is null or coalesce(gi.uses_count, 0) < gi.max_uses)
    )
  from public.group_invites gi
  join public.groups g on g.id = gi.group_id
  left join public.group_members gm on gm.group_id = g.id
  where (gi.token = p_code or gi.invite_code = p_code)
    and (g.is_active = true or g.is_active is null)
    and g.deleted_at is null
  group by g.id, g.slug, g.name, g.description,
           gi.expires_at, gi.max_uses, gi.uses_count;
$function$;

create function public.get_invite_details(p_code text)
returns table(
  group_id uuid,
  group_slug text,
  group_name text,
  description text,
  member_count bigint,
  is_valid boolean
)
language sql
stable
set search_path to ''
as $function$
  select * from rpc_private.get_invite_details(p_code);
$function$;

-- Schema/function access so the PostgREST roles can actually reach the RPCs.
grant usage on schema rpc_private to anon, authenticated;
grant execute on function rpc_private.get_invite_details(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.get_invite_details(text) to anon, authenticated;
