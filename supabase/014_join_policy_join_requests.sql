-- 014: community_join_requests table, groups.join_policy column,
-- community_respond_join_request RPC, updated community_create_group/community_discover_groups.
-- Idempotent (IF NOT EXISTS / OR REPLACE).

-- 1. join_policy column on groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'request';

-- 2. community_join_requests table
CREATE TABLE IF NOT EXISTS public.community_join_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_join_requests ADD PRIMARY KEY IF NOT EXISTS (id);
CREATE INDEX IF NOT EXISTS idx_community_join_requests_group ON public.community_join_requests (group_id);
CREATE INDEX IF NOT EXISTS idx_community_join_requests_user ON public.community_join_requests (user_id);

-- 3. community_respond_join_request RPC
CREATE OR REPLACE FUNCTION public.community_respond_join_request(p_request_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  gid uuid; uid uuid;
begin
  select jr.group_id, jr.user_id into gid, uid
    from public.community_join_requests jr where jr.id = p_request_id and jr.status = 'pending';
  if gid is null then raise exception 'request_not_found'; end if;
  if not exists (select 1 from public.group_members gm
                 where gm.group_id = gid and gm.user_id = auth.uid()
                   and gm.role in ('owner','coowner') and gm.left_at is null) then
    raise exception 'not_allowed';
  end if;
  update public.community_join_requests set status = case when p_accept then 'accepted' else 'rejected' end
   where id = p_request_id;
  if p_accept then
    insert into public.group_members (group_id, user_id, role, joined_at)
    values (gid, uid, 'member', now())
    on conflict (group_id, user_id) do update set left_at = null;
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.community_respond_join_request(p_request_id uuid, p_accept boolean) TO anon;

-- 4. RLS for join_requests
ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'join_requests_select' AND tablename = 'community_join_requests') THEN
    CREATE POLICY join_requests_select ON public.community_join_requests FOR SELECT USING (
      auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.group_members gm WHERE gm.group_id = community_join_requests.group_id AND gm.user_id = auth.uid() AND gm.left_at IS NULL
      )
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'join_requests_insert' AND tablename = 'community_join_requests') THEN
    CREATE POLICY join_requests_insert ON public.community_join_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
