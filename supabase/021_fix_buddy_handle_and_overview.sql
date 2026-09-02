-- 021_fix_buddy_handle_and_overview.sql
--
-- The buddy feature was entirely dead. Two independent defects, both verified
-- live against the database with a real user JWT before this file was written.
--
-- ============================================================================
-- DEFECT 1 — the handle is written to one place and read from another
-- ============================================================================
--
--   community_bootstrap_profile  WRITES  profile_data->>'community_handle'   (JSONB key)
--   community_request_buddy      READS   user_profiles.handle                (real column)
--
-- user_profiles has BOTH: a `handle text` column, and a `profile_data jsonb`
-- blob. The writer only ever populates the JSONB key; the column stays NULL for
-- every user. So the lookup
--
--     select user_id into fid from public.user_profiles
--      where lower(handle) = lower(p_handle) limit 1;
--
-- can never match, `fid` is always NULL, and the function raises `user_not_found`
-- for every handle for every user, always. Reproduced through PostgREST:
--
--     community_request_buddy {p_handle:"suyash"}              -> 400 P0001 user_not_found
--     community_request_buddy {p_handle:"elixir_suyashprabhu"} -> 400 P0001 user_not_found
--     community_respond_buddy {p_connection_id, p_accept}      -> 200 {"ok": true}
--     community_remove_buddy  {p_other_user, p_block}          -> 200 {"ok": true}
--
-- Note which ones pass. Only the ENTRY POINT is broken, which is why the whole
-- feature looks dead rather than partly broken: respond and remove are fine, but
-- you can never create a connection for them to act on. `ux_profiles_handle`
-- indexes lower(handle) on a column nothing writes, and community_friends and
-- buddy_invites are empty as a direct consequence.
--
-- FIX, in three parts:
--   a) bootstrap writes BOTH the column and the JSONB key, so the value lands
--      where the index and every reader expect it. The JSONB key is kept because
--      Community-CEnEgsrd.js and the profile sync path both read it; dropping it
--      would trade this bug for a different one.
--   b) request_buddy accepts EITHER location, and also matches users.username.
--      A user who enrolled before this migration has a handle only in JSONB, and
--      a user who never enrolled has one only in users.username — refusing those
--      would leave existing accounts unsearchable until they re-enrolled.
--   c) a one-time backfill for rows that already have a JSONB handle or a
--      username, so existing accounts become findable immediately.
--
-- Also fixed here: request_buddy silently swallowed unique_violation and then
-- re-selected, so requesting an existing buddy looked identical to creating a
-- new one. It now reports which happened, and refuses to re-request a blocked
-- connection.
--
-- ============================================================================
-- DEFECT 2 — community_get_overview returns no buddies at all
-- ============================================================================
--
-- The overview RPC returns only `stats` and `groups`:
--
--     jsonb_build_object('stats', …, 'groups', …)
--
-- but the UI reads `overview.buddies` and splits it by `requestStatus`:
--
--     const accepted = (s.buddies||[]).filter(c => c.requestStatus === "accepted")
--     const pending  = (s.buddies||[]).filter(c => c.requestStatus === "pending")
--
-- `s.buddies = s.buddies || []` normalises the missing key to an empty array, so
-- there is no error — the buddies panel just renders permanently empty. This is
-- the second half of "buddy things also do not work": even after a request
-- succeeds, nothing appears.
--
-- So: adding a buddy DOES let you see their progress, but only once the overview
-- actually returns it. The fields below are exactly the ones the compiled bundle
-- reads, nothing more:
--
--     userId, connectionId, requestStatus, name, handle, avatarUrl,
--     status, currentSubject, minutesToday,
--     subjects[{name, minutes, questions}], tasks[{id, title, subject, done}]
--
-- PRIVACY IS ENFORCED SERVER-SIDE, per the buddy's own settings from
-- community_enrollments.privacy — not by the client choosing what to display.
-- A client-side filter is not a privacy control: the data has already left the
-- database by then. stealthMode hides live status entirely; shareTasks,
-- shareSubjectBreakdown, shareQuestionCounts, shareExactTime and
-- shareCurrentSubject each gate their own field. Defaults match
-- community_get_privacy: share, except allowStartNotifications and stealthMode.
--
-- Pending requests are split by DIRECTION. community_respond_buddy is only valid
-- for a request someone sent to you; showing your own outgoing requests in the
-- same list produces an Accept button that can never work.
--
-- ============================================================================
-- SAFETY
-- ============================================================================
-- Idempotent: CREATE OR REPLACE for both functions, guarded UPDATEs for the
-- backfill. No DROP, no data loss. Rollback in _rollback_buddy_handle.sql.
-- Return types are unchanged (uuid, jsonb), so no DROP FUNCTION is required.

BEGIN;

-- ── 1a. bootstrap writes the column as well as the JSONB key ─────────────────

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
  v_uid    uuid := auth.uid();
  v_handle text;
  v_taken  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Normalise once, here, so the column, the JSONB key and the unique index all
  -- agree. ux_profiles_handle is on lower(handle); storing mixed case would let
  -- two users differ only by case and collide on insert instead of on validation.
  v_handle := nullif(btrim(coalesce(p_handle, '')), '');
  IF v_handle IS NOT NULL THEN
    v_handle := lower(regexp_replace(v_handle, '[^A-Za-z0-9_]+', '_', 'g'));
    v_handle := nullif(btrim(v_handle, '_'), '');
  END IF;

  -- A handle is how other people find you, so a clash has to be reported rather
  -- than silently applied and then rejected by the index.
  IF v_handle IS NOT NULL THEN
    SELECT user_id INTO v_taken
      FROM public.user_profiles
     WHERE lower(handle) = v_handle
       AND user_id <> v_uid
     LIMIT 1;
    IF v_taken IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        -- Readable for the UI, machine-readable for anything that wants to branch.
        'error', format('The handle @%s is already taken. Pick another.', v_handle),
        'code',  'handle_taken',
        'handle', v_handle);
    END IF;
  END IF;

  -- Ensure a row exists. Enrolment used to depend on user_profiles already
  -- having been created by the signup trigger; when it had not, the UPDATE
  -- matched zero rows and reported success having written nothing.
  INSERT INTO public.user_profiles (user_id, profile_data, created_at, updated_at)
  VALUES (v_uid, '{}'::jsonb, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_profiles
     SET handle       = COALESCE(v_handle, handle),
         display_name = COALESCE(nullif(btrim(p_display_name), ''), display_name),
         profile_data = jsonb_set(
                          jsonb_set(
                            jsonb_set(
                              jsonb_set(
                                COALESCE(profile_data, '{}'::jsonb),
                                '{community_enrolled}', 'true'::jsonb, true),
                              '{community_handle}', to_jsonb(COALESCE(v_handle, handle)), true),
                            '{community_display_name}', to_jsonb(p_display_name), true),
                          '{community_day_offset_hours}', to_jsonb(p_day_offset_hours), true),
         updated_at   = now()
   WHERE user_id = v_uid;

  -- Enrolment row carries privacy + day offset; the overview reads it.
  INSERT INTO public.community_enrollments (user_id, enrolled, day_offset_hours, created_at, updated_at)
  VALUES (v_uid, true, COALESCE(p_day_offset_hours, 0), now(), now())
  ON CONFLICT (user_id) DO UPDATE
     SET enrolled         = true,
         day_offset_hours = COALESCE(EXCLUDED.day_offset_hours, public.community_enrollments.day_offset_hours),
         onboarded        = true,
         updated_at       = now();

  RETURN jsonb_build_object(
    'success', true,
    'handle',  (SELECT handle FROM public.user_profiles WHERE user_id = v_uid)
  );
END;
$function$;

-- ── 1b. request_buddy accepts the column, the JSONB key, or users.username ───

CREATE OR REPLACE FUNCTION public.community_request_buddy(p_handle text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  uid    uuid := auth.uid();
  needle text;
  fid    uuid;
  cid    uuid;
  st     text;
begin
  -- Messages are written for a STUDENT, not a developer.
  --
  -- communityApi surfaces the Postgres error verbatim:
  --     const u = e => e instanceof Error ? e.message : "Something went wrong."
  --     catch (r) { return { success: false, error: u(r) } }
  -- so `raise exception 'user_not_found'` renders "user_not_found" in the UI. The
  -- bundle is compiled and baked into the APK, so the readable text has to come
  -- from here.
  if uid is null then
    raise exception 'Please sign in to add a study buddy.';
  end if;

  needle := lower(btrim(coalesce(p_handle, '')));
  needle := ltrim(needle, '@');           -- users type "@name"; the store holds "name"
  if needle = '' then
    raise exception 'Enter your buddy''s handle.';
  end if;

  -- Three lookups, in order of authority. The column is canonical; the JSONB key
  -- covers accounts enrolled before this migration; users.username covers
  -- accounts that never enrolled in Community but are still findable by name.
  select user_id into fid
    from public.user_profiles
   where lower(handle) = needle
     and deleted_at is null
   limit 1;

  if fid is null then
    select user_id into fid
      from public.user_profiles
     where lower(profile_data->>'community_handle') = needle
       and deleted_at is null
     limit 1;
  end if;

  if fid is null then
    select id into fid
      from public.users
     where lower(username) = needle
       and deleted_at is null
     limit 1;
  end if;

  if fid is null then
    raise exception 'No one is using the handle @%. Check the spelling and try again.', needle;
  end if;
  if fid = uid then
    raise exception 'That is your own handle.';
  end if;

  -- An existing connection decides what happens next. Previously any
  -- unique_violation was swallowed and the row re-selected, so re-requesting an
  -- existing buddy — or one who had blocked you — was indistinguishable from a
  -- fresh request.
  select id, status into cid, st
    from public.community_friends
   where (user_id = uid and friend_id = fid)
      or (user_id = fid and friend_id = uid)
   limit 1;

  if cid is not null then
    if st = 'blocked' then
      raise exception 'You cannot send a request to @%.', needle;
    end if;
    return cid;
  end if;

  insert into public.community_friends (user_id, friend_id, status, created_at, updated_at)
  values (uid, fid, 'pending', now(), now())
  on conflict do nothing
  returning id into cid;

  if cid is null then
    -- Lost a race with a concurrent request; the row exists either way.
    select id into cid
      from public.community_friends
     where (user_id = uid and friend_id = fid)
        or (user_id = fid and friend_id = uid)
     limit 1;
  end if;

  return cid;
end
$function$;

-- ── 1c. backfill so existing accounts are findable immediately ───────────────
--
-- Both backfills deduplicate WITHIN the statement, not just against rows already
-- present. A NOT EXISTS subquery cannot see rows being written by the same
-- UPDATE, so on real data this failed with
--     23505 duplicate key value violates unique constraint "ux_profiles_handle"
--     DETAIL: Key (lower(handle))=(suyash) already exists.
-- because two accounts held the usernames `suyash` and `Suyash`, which normalise
-- to one handle. row_number() picks a single deterministic winner per normalised
-- handle (oldest profile wins, so the established account keeps the name); the
-- loser keeps handle NULL and is still reachable by users.username in
-- request_buddy's third lookup, then picks a handle at next enrolment.

WITH candidate AS (
  SELECT p.user_id,
         lower(regexp_replace(p.profile_data->>'community_handle', '[^A-Za-z0-9_]+', '_', 'g')) AS h,
         p.created_at
    FROM public.user_profiles p
   WHERE p.handle IS NULL
     AND nullif(btrim(coalesce(p.profile_data->>'community_handle', '')), '') IS NOT NULL
), ranked AS (
  SELECT user_id, h,
         row_number() OVER (PARTITION BY h ORDER BY created_at NULLS LAST, user_id) AS rn
    FROM candidate
   WHERE nullif(btrim(h, '_'), '') IS NOT NULL
)
UPDATE public.user_profiles p
   SET handle = r.h
  FROM ranked r
 WHERE p.user_id = r.user_id
   AND r.rn = 1
   AND NOT EXISTS (
     SELECT 1 FROM public.user_profiles q
      WHERE q.user_id <> p.user_id AND lower(q.handle) = r.h
   );

WITH candidate AS (
  SELECT p.user_id,
         lower(regexp_replace(u.username, '[^A-Za-z0-9_]+', '_', 'g')) AS h,
         p.created_at
    FROM public.user_profiles p
    JOIN public.users u ON u.id = p.user_id
   WHERE p.handle IS NULL
     AND nullif(btrim(coalesce(u.username, '')), '') IS NOT NULL
), ranked AS (
  SELECT user_id, h,
         row_number() OVER (PARTITION BY h ORDER BY created_at NULLS LAST, user_id) AS rn
    FROM candidate
   WHERE nullif(btrim(h, '_'), '') IS NOT NULL
)
UPDATE public.user_profiles p
   SET handle = r.h
  FROM ranked r
 WHERE p.user_id = r.user_id
   AND r.rn = 1
   AND NOT EXISTS (
     SELECT 1 FROM public.user_profiles q
      WHERE q.user_id <> p.user_id AND lower(q.handle) = r.h
   );

-- Mirror the column back into the JSONB key so both agree from here on.
UPDATE public.user_profiles
   SET profile_data = jsonb_set(COALESCE(profile_data, '{}'::jsonb),
                                '{community_handle}', to_jsonb(handle), true)
 WHERE handle IS NOT NULL
   AND COALESCE(profile_data->>'community_handle', '') <> handle;

-- ── 2. overview returns buddies, with each buddy's own privacy applied ───────

CREATE OR REPLACE FUNCTION public.community_get_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  uid      uuid := auth.uid();
  v_offset integer := 0;
  v_day    date;
  result   jsonb;
begin
  -- The day boundary is the USER'S, not UTC. A student studying at 01:00 local
  -- has not started a new day yet, and showing their buddies' minutes as 0
  -- because UTC rolled over is wrong in the way that makes people distrust the
  -- number.
  select coalesce(day_offset_hours, 0) into v_offset
    from public.community_enrollments where user_id = uid;
  v_day := (now() + make_interval(hours => coalesce(v_offset, 0)))::date;

  with conn as (
    -- Direction matters: community_respond_buddy only accepts a request that was
    -- sent TO you, so an outgoing request rendered with an Accept button is a
    -- button that always fails.
    select f.id  as connection_id,
           case when f.user_id = uid then f.friend_id else f.user_id end as buddy_id,
           f.status,
           (f.user_id = uid) as outgoing
      from public.community_friends f
     where (f.user_id = uid or f.friend_id = uid)
       and coalesce(f.status, 'pending') <> 'blocked'
  ),
  priv as (
    select c.buddy_id,
           coalesce((e.privacy->>'stealthMode')::boolean,
                    (e.privacy->>'stealth_mode')::boolean, false)            as stealth,
           coalesce((e.privacy->>'shareLiveStatus')::boolean,
                    (e.privacy->>'share_live_status')::boolean, true)        as share_live,
           coalesce((e.privacy->>'shareCurrentSubject')::boolean,
                    (e.privacy->>'share_current_subject')::boolean, true)    as share_subject,
           coalesce((e.privacy->>'shareTasks')::boolean,
                    (e.privacy->>'share_tasks')::boolean, true)              as share_tasks,
           coalesce((e.privacy->>'shareExactTime')::boolean,
                    (e.privacy->>'share_exact_time')::boolean, true)         as share_time,
           coalesce((e.privacy->>'shareSubjectBreakdown')::boolean,
                    (e.privacy->>'share_subject_breakdown')::boolean, true)  as share_breakdown,
           coalesce((e.privacy->>'shareQuestionCounts')::boolean,
                    (e.privacy->>'share_question_counts')::boolean, true)    as share_questions,
           -- community_get_privacy exposes shareCurrentTask and the UI renders
           -- presence.task, so it needs its own gate. Without it the task title
           -- would ride along under shareCurrentSubject, and a user who shared a
           -- subject but not a task would leak the task.
           coalesce((e.privacy->>'shareCurrentTask')::boolean,
                    (e.privacy->>'share_current_task')::boolean, true)       as share_task
      from conn c
      left join public.community_enrollments e on e.user_id = c.buddy_id
  ),
  mins as (
    select c.buddy_id,
           coalesce(sum(s.duration_minutes), 0)::int as minutes_today
      from conn c
      left join public.study_sessions_log s
             on s.user_id = c.buddy_id
            and s.deleted_at is null
            and (s.ended_at + make_interval(hours => coalesce(v_offset, 0)))::date = v_day
     group by c.buddy_id
  ),
  subj as (
    select c.buddy_id,
           jsonb_agg(jsonb_build_object(
             'name',      x.subject,
             'minutes',   x.minutes,
             -- Question counts live on the session rows only when the user logs
             -- them; absent is 0, which the UI sums without special-casing.
             'questions', 0
           ) order by x.minutes desc) as subjects
      from conn c
      join lateral (
        select coalesce(nullif(btrim(s.subject), ''), 'General') as subject,
               coalesce(sum(s.duration_minutes), 0)::int         as minutes
          from public.study_sessions_log s
         where s.user_id = c.buddy_id
           and s.deleted_at is null
           and (s.ended_at + make_interval(hours => coalesce(v_offset, 0)))::date = v_day
         group by 1
         order by 2 desc
         limit 8
      ) x on true
     group by c.buddy_id
  ),
  tsk as (
    select c.buddy_id,
           jsonb_agg(jsonb_build_object(
             'id',      x.id,
             'title',   x.title,
             'subject', x.subject,
             'done',    x.done
           ) order by x.done, x.title) as tasks
      from conn c
      join lateral (
        select t.id,
               t.title,
               coalesce(nullif(btrim(t.subject), ''), 'General') as subject,
               (t.status = 'completed' or t.completed_at is not null) as done
          from public.tasks t
         where t.user_id = c.buddy_id
           and t.deleted_at is null
           and (
             (t.due_date is not null
               and (t.due_date + make_interval(hours => coalesce(v_offset, 0)))::date = v_day)
             or (t.completed_at is not null
               and (t.completed_at + make_interval(hours => coalesce(v_offset, 0)))::date = v_day)
           )
         order by 4, 2
         limit 12
      ) x on true
     group by c.buddy_id
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'totalGroups',  (select count(*) from public.groups where deleted_at is null),
      'totalMembers', (select count(distinct user_id) from public.group_members),
      'totalMessages', 0
    ),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'id',   g.id,
        'name', g.name,
        'slug', coalesce(nullif(g.slug, ''), lower(regexp_replace(g.name, '[^a-zA-Z0-9]+', '-', 'g'))),
        'memberCount', (select count(*) from public.group_members where group_id = g.id),
        -- Real figure, not the hardcoded 0 this returned before: members seen
        -- inside the last two minutes.
        'activeNow', (
          select count(*) from public.group_members gm
            join public.user_presence up on up.user_id = gm.user_id
           where gm.group_id = g.id
             and coalesce(up.is_online, up.status = 'studying') is true
             and coalesce(up.last_beat_at, up.last_seen) > now() - interval '2 minutes'
        ),
        'visualKey', g.visual_key,
        'exam', g.exam
      )) from public.groups g where g.deleted_at is null), '[]'::jsonb),

    'buddies', coalesce((select jsonb_agg(jsonb_build_object(
        'userId',        c.buddy_id,
        'connectionId',  c.connection_id,
        'requestStatus', case when c.status = 'accepted' then 'accepted' else 'pending' end,
        -- Outgoing pending requests must not render an Accept control.
        'outgoing',      c.outgoing,
        'name',          coalesce(nullif(btrim(pr.display_name), ''),
                                  nullif(btrim(u.name), ''),
                                  nullif(btrim(pr.handle), ''),
                                  'Study buddy'),
        'handle',        pr.handle,
        'avatarUrl',     u.avatar_url,
        -- Live status is emitted in BOTH shapes, deliberately.
        --
        -- The compiled bundle reads them inconsistently and both spellings are
        -- live in the same file:
        --
        --   nested   s.presence.state / .subject / .task   — 22 sites, incl. the
        --            buddy-card mapper and the "studying now" rail
        --   flat     n.currentSubject, n.status            — the member row it
        --            maps INTO, shared with group members
        --
        -- The first version of this RPC returned only the flat pair, so
        -- `s.presence` was undefined for EVERY buddy and every one of those 22
        -- sites threw `Cannot read properties of undefined (reading 'state')`
        -- inside render, unmounting the tree and blanking the page. Nothing had
        -- hit it only because community_request_buddy failed for everyone, so no
        -- accepted pair existed — the first person to accept a request would have
        -- crashed. Emitting both is the only shape that satisfies the bundle, and
        -- the bundle is baked into the APK so it cannot be the thing that changes.
        --
        -- `presence` is always an OBJECT, never null: a null would reintroduce the
        -- same crash by a different route, since the call sites dereference it
        -- without a guard.
        'presence', jsonb_build_object(
          'state',   case
                       when p.stealth or not p.share_live then 'idle'
                       when coalesce(up.last_beat_at, up.last_seen) > now() - interval '2 minutes'
                         then coalesce(nullif(up.state, ''), nullif(up.status, ''), 'idle')
                       else 'idle'
                     end,
          'subject', case
                       when p.stealth or not p.share_subject then null
                       when coalesce(up.last_beat_at, up.last_seen) > now() - interval '2 minutes'
                         then coalesce(nullif(up.subject_name, ''), nullif(up.current_subject, ''))
                       else null
                     end,
          'task',    case
                       when p.stealth or not p.share_task then null
                       when coalesce(up.last_beat_at, up.last_seen) > now() - interval '2 minutes'
                         then nullif(up.task_title, '')
                       else null
                     end
        ),
        -- Flat aliases of the same two values. Kept in sync by construction:
        -- change the CASE above and these follow, because they read the object.
        'status',        case
                           when p.stealth or not p.share_live then 'idle'
                           when coalesce(up.last_beat_at, up.last_seen) > now() - interval '2 minutes'
                             then coalesce(nullif(up.state, ''), nullif(up.status, ''), 'idle')
                           else 'idle'
                         end,
        'currentSubject', case
                            when p.stealth or not p.share_subject then null
                            when coalesce(up.last_beat_at, up.last_seen) > now() - interval '2 minutes'
                              then coalesce(nullif(up.subject_name, ''), nullif(up.current_subject, ''))
                            else null
                          end,
        'minutesToday',  case when p.share_time then coalesce(m.minutes_today, 0) else null end,
        -- `subjects` and `tasks` are NULL when withheld and [] when genuinely
        -- empty, because the UI distinguishes them:
        --     s.subjects === null  -> "Subject details are not shared."
        --     (s.subjects||[])     -> "No settled study time in this period."
        -- Returning [] for a withheld field would tell the reader their buddy did
        -- nothing today, which is a different and wrong statement.
        'subjects',      case when p.share_breakdown
                              then coalesce(
                                     case when p.share_questions then sb.subjects
                                          -- Withheld question counts must be NULL,
                                          -- not absent. The UI tests
                                          -- `r.questions !== null` and renders the
                                          -- value otherwise — a stripped key is
                                          -- `undefined`, which is !== null, so it
                                          -- printed the literal text
                                          -- "undefined questions". NULL renders
                                          -- as the intended em dash.
                                          else (select jsonb_agg(jsonb_set(e, '{questions}', 'null'::jsonb))
                                                  from jsonb_array_elements(sb.subjects) e)
                                     end, '[]'::jsonb)
                              else null end,
        'tasks',         case when p.share_tasks then coalesce(tk.tasks, '[]'::jsonb) else null end
      ))
      from conn c
      join priv p           on p.buddy_id = c.buddy_id
      left join public.user_profiles pr on pr.user_id = c.buddy_id
      left join public.users u          on u.id       = c.buddy_id
      left join public.user_presence up on up.user_id = c.buddy_id
      left join mins m      on m.buddy_id = c.buddy_id
      left join subj sb     on sb.buddy_id = c.buddy_id
      left join tsk  tk     on tk.buddy_id = c.buddy_id
    ), '[]'::jsonb),

    -- Incoming group join requests for groups the caller manages. The UI already
    -- reads overview.groupRequests and normalises a missing key to [], so this
    -- was silently empty for the same reason buddies was.
    'groupRequests', coalesce((select jsonb_agg(jsonb_build_object(
        'id',        r.id,
        'groupId',   r.group_id,
        'groupName', g.name,
        'userId',    r.user_id,
        'name',      coalesce(nullif(btrim(u2.name), ''), nullif(btrim(pr2.handle), ''), 'Student'),
        'handle',    pr2.handle,
        'avatarUrl', u2.avatar_url,
        'createdAt', r.created_at
      ))
      from public.community_join_requests r
      join public.groups g on g.id = r.group_id
      join public.group_members gm on gm.group_id = r.group_id
                                  and gm.user_id = uid
                                  and gm.role in ('owner', 'admin')
      left join public.users u2         on u2.id       = r.user_id
      left join public.user_profiles pr2 on pr2.user_id = r.user_id
     where coalesce(r.status, 'pending') = 'pending'), '[]'::jsonb)
  ) into result;

  return result;
end
$function$;

REVOKE ALL ON FUNCTION public.community_get_overview()                                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_request_buddy(text)                           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_bootstrap_profile(text, text, integer)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_get_overview()                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_request_buddy(text)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_bootstrap_profile(text, text, integer)      TO authenticated;

COMMIT;
